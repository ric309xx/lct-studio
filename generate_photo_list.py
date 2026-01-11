import os
import json
import shutil
import io
from PIL import Image, ImageDraw, ImageFont, ExifTags, ImageCms

# --- 設定區 ---
# 1. 來源與輸出路徑
source_parent_folder = 'photos'
output_parent_folder = 'public'
output_json_file = 'public/photos.json'

# 2. 圖片處理設定 (分別設定寬度)
portfolio_resize_width = 1280  # 作品集照片寬度
asset_resize_width = 300       # 素材照片寬度 (例如個人頭像)
jpeg_quality = 85

# 3. 浮水印設定
watermark_text = "©LCT"
font_file = 'NotoSansTC-Bold.otf' # 請確保此字型檔與 .py 檔在同一目錄
font_size = 72
font_color = (255, 255, 255, 128) # RGBA，A=128 為半透明

# 4. 資料夾設定
portfolio_categories = ["城市光影", "大地映像"]
asset_folders = ["assets"]

# 5. 其他設定
supported_extensions = ['.jpg', '.jpeg', '.png', '.gif']
# --- 結束設定 ---


import stat
import time

def remove_readonly(func, path, _):
    """
    錯誤處理函式：嘗試移除唯讀屬性後重試刪除。
    用來解決 Windows 上 [WinError 5] 存取被拒的問題。
    """
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as e:
        print(f"  ! 無法移除唯讀屬性或刪除失敗: {path}, {e}")

def clean_output():
    """
    刪除舊的 public/photos 和 public/assets 資料夾及 JSON 檔案。
    """
    print("--- 正在清理舊檔案... ---")
    
    paths_to_delete = [
        os.path.join(output_parent_folder, 'photos'),
    ]
    for asset_folder in asset_folders:
        paths_to_delete.append(os.path.join(output_parent_folder, asset_folder))
    
    for path in paths_to_delete:
        if os.path.exists(path):
            try:
                # onerror=remove_readonly 可自動處理唯讀檔案無法刪除的問題
                shutil.rmtree(path, onerror=remove_readonly)
                print(f"已刪除舊的資料夾: '{path}'")
            except Exception as e:
                print(f"\n!!! 警告：刪除資料夾 '{path}' 時遇到阻礙。")
                print(f"    錯誤訊息: {e}")
                print("    嘗試等待 1 秒後重試...")
                time.sleep(1)
                try:
                    shutil.rmtree(path, onerror=remove_readonly)
                    print(f"    (重試成功) 已刪除: '{path}'")
                except Exception as e2:
                    print(f"    (重試失敗) 請手動刪除該資料夾，或關閉佔用程式。錯誤: {e2}")
                    # 不強制 return False，讓程式嘗試繼續執行，或讓使用者自行決定
                    # return False 

    if os.path.exists(output_json_file):
        try:
            os.remove(output_json_file)
            print(f"已刪除舊的 JSON 檔案: '{output_json_file}'")
        except Exception as e:
            print(f"警告：無法刪除 JSON 檔案 '{output_json_file}' ({e})，將直接嘗試覆寫。")
            
    print("清理作業結束，繼續執行...")
    return True


def get_decimal_from_dms(dms, ref):
    """將度/分/秒 (DMS) 格式轉換為十進位度數。"""
    degrees = dms[0]
    minutes = dms[1]
    seconds = dms[2]
    
    decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
    
    if ref in ['S', 'W']:
        decimal = -decimal
        
    return decimal


def get_gps_info(img):
    """從圖片的 EXIF 資料中提取 GPS 經緯度。"""
    try:
        exif_data = img._getexif()
        if not exif_data:
            return None

        gps_info = {}
        for tag, value in exif_data.items():
            decoded = ExifTags.TAGS.get(tag, tag)
            if decoded == 'GPSInfo':
                gps_info = value
                break
        
        if not gps_info:
            return None

        gps_lat_ref = gps_info.get(1)
        gps_lat = gps_info.get(2)
        gps_lng_ref = gps_info.get(3)
        gps_lng = gps_info.get(4)
        gps_alt = gps_info.get(6)

        if gps_lat and gps_lat_ref and gps_lng and gps_lng_ref:
            lat = get_decimal_from_dms(gps_lat, gps_lat_ref)
            lng = get_decimal_from_dms(gps_lng, gps_lng_ref)
            
            result = {
                "lat": round(lat, 6),
                "lng": round(lng, 6)
            }
            if gps_alt is not None:
                try:
                    alt_val = float(gps_alt)
                except:
                    alt_val = 0
                result["alt"] = round(alt_val, 2)
            return result

    except Exception as e:
        print(f"  ! 讀取 GPS 發生錯誤: {e}")
        return None

    return None


def get_dominant_color(img):
    """提取圖片的顯著色 (Dominant Color)。"""
    try:
        img_copy = img.copy()
        if img_copy.mode != 'RGB':
            img_copy = img_copy.convert('RGB')
        img_copy.thumbnail((150, 150))

        quantized = img_copy.quantize(colors=5, method=Image.MAXCOVERAGE)
        counts = quantized.getcolors(maxcolors=256)
        if not counts:
            return (128, 128, 128)

        counts.sort(key=lambda x: x[0], reverse=True)
        dominant_index = counts[0][1]
        palette = quantized.getpalette()
        r = palette[dominant_index * 3]
        g = palette[dominant_index * 3 + 1]
        b = palette[dominant_index * 3 + 2]
        
        return (r, g, b)
    except Exception as e:
        print(f"  ! 計算主色時發生錯誤: {e}, 改用預設灰色")
        return (128, 128, 128)


def convert_to_srgb(img):
    """
    【關鍵新增】將圖片強制轉換為 sRGB 色彩空間。
    解決廣色域照片在瀏覽器變螢光色、過亮的問題。
    """
    icc = img.info.get('icc_profile')
    
    # 如果原本沒有 ICC Profile，通常假設它已經是 RGB/sRGB，直接回傳
    if not icc:
        return img.convert('RGB')

    try:
        # 讀取圖片原本的描述檔 (Source Profile)
        src_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        # 建立標準 sRGB 描述檔 (Destination Profile)
        srgb_profile = ImageCms.createProfile('sRGB')

        # 執行轉換：將原本的顏色數值 映射到 sRGB 空間
        # inPlace=False 代表回傳新的圖片物件
        img_srgb = ImageCms.profileToProfile(img, src_profile, srgb_profile)
        
        return img_srgb.convert('RGB')

    except Exception as e:
        print(f"  ! 色彩空間轉換警告: {e} (將維持原樣)")
        return img.convert('RGB')


def process_image(source_path, output_path, target_width, add_watermark=True):
    """處理單一圖片：讀取GPS -> 轉sRGB -> 縮放 -> 加浮水印 -> 存檔"""
    try:
        current_gps_info = None
        
        with Image.open(source_path) as img:
            # 1. 先讀取 GPS (最保險，確保在任何轉換前拿到 EXIF)
            current_gps_info = get_gps_info(img)
            if current_gps_info:
                print(f"  * 發現 GPS: {current_gps_info}")
            
            # 2. 【關鍵步驟】轉換為 sRGB
            # 這會修正「網頁看起來太亮/螢光」的問題
            img = convert_to_srgb(img)

            # 3. 縮放處理
            if img.width > target_width:
                aspect_ratio = img.height / img.width
                new_height = int(target_width * aspect_ratio)
                img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)

            # 4. 加上浮水印
            if add_watermark:
                if img.mode != 'RGBA': img = img.convert('RGBA')
                txt_layer = Image.new('RGBA', img.size, (255, 255, 255, 0))
                draw = ImageDraw.Draw(txt_layer)
                
                short_side = min(img.width, img.height)
                dynamic_font_size = int(short_side * 0.08)
                if dynamic_font_size < 12: dynamic_font_size = 12

                try:
                    current_font = ImageFont.truetype(font_file, dynamic_font_size)
                except IOError:
                    print(f"警告: 找不到字型 {font_file}，嘗試使用預設字型。")
                    current_font = ImageFont.load_default()

                try:
                    x, y = img.width / 2, img.height / 2
                    draw.text((x, y), watermark_text, font=current_font, fill=font_color, anchor='mm')
                except AttributeError:
                    text_width, text_height = draw.textsize(watermark_text, current_font)
                    x = (img.width - text_width) / 2
                    y = (img.height - text_height) / 2
                    draw.text((x, y), watermark_text, font=current_font, fill=font_color)

                img = Image.alpha_composite(img, txt_layer)

            # 5. 存檔 (去除所有 metadata 以縮小體積，因為 GPS 已經存在 JSON 了)
            if output_path.lower().endswith(('.jpg', '.jpeg')):
                if img.mode == 'RGBA': img = img.convert('RGB')
                # icc_profile=None 確保不寫入舊的 Profile，讓瀏覽器預設使用 sRGB
                img.save(output_path, 'JPEG', quality=jpeg_quality, optimize=True)
            else:
                img.save(output_path)
            
            print(f"  - 已處理: {os.path.basename(source_path)} (轉sRGB -> 寬{img.width})")
            
            dominant_color = get_dominant_color(img)
            
            return True, dominant_color, current_gps_info
            
    except Exception as e:
        print(f"處理檔案 {os.path.basename(source_path)} 時發生錯誤: {e}")
        return False, None, None


def run_processor():
    """主執行函式"""
    
    if not clean_output():
        print("\n--- 程式因清理失敗而中止 ---")
        input("請排除錯誤後按 Enter 鍵結束...") 
        return

    if not os.path.isdir(source_parent_folder):
        print(f"錯誤：找不到來源資料夾 '{source_parent_folder}'。")
        return

    os.makedirs(output_parent_folder, exist_ok=True)
    
    # --- 1. 處理作品集分類照片 ---
    all_photo_data = {}
    print("\n--- 正在處理作品集照片 (sRGB轉換 + 浮水印) ---")
    for category in portfolio_categories:
        source_category_path = os.path.join(source_parent_folder, category)
        output_category_path = os.path.join(output_parent_folder, 'photos', category)
        
        all_photo_data[category] = []
        if not os.path.isdir(source_category_path):
            print(f"警告：找不到分類資料夾 '{source_category_path}'，已跳過。")
            continue
        
        os.makedirs(output_category_path, exist_ok=True)
        files = [f for f in os.listdir(source_category_path) if os.path.splitext(f)[1].lower() in supported_extensions]
        
        if not files:
            print(f"  - 分類 '{category}' 中沒有找到圖片。")
            continue

        for filename in files:
            source_path = os.path.join(source_category_path, filename)
            output_path = os.path.join(output_category_path, filename)
            success, color, gps_info = process_image(source_path, output_path, target_width=portfolio_resize_width, add_watermark=True)
            if success:
                img_data = {
                    "filename": filename,
                    "color": color
                }
                if gps_info:
                    img_data["gps"] = gps_info
                
                all_photo_data[category].append(img_data)

    os.makedirs(output_parent_folder, exist_ok=True)
    with open(output_json_file, 'w', encoding='utf-8') as f:
        json.dump(all_photo_data, f, ensure_ascii=False, indent=2)
    print(f"作品集 JSON 清單已寫入 '{output_json_file}'。")

    # --- 2. 處理網站素材 ---
    print("\n--- 正在處理網站素材 (sRGB轉換) ---")
    for asset_dir in asset_folders:
        source_asset_path = os.path.join(source_parent_folder, asset_dir)
        output_asset_path = os.path.join(output_parent_folder, asset_dir)

        if not os.path.isdir(source_asset_path):
            print(f"警告：找不到素材資料夾 '{source_asset_path}'，已跳過。")
            continue

        os.makedirs(output_asset_path, exist_ok=True)
        files = [f for f in os.listdir(source_asset_path) if os.path.splitext(f)[1].lower() in supported_extensions]
        
        if not files:
            print(f"  - 素材資料夾 '{asset_dir}' 中沒有找到圖片。")
            continue

        for filename in files:
            source_path = os.path.join(source_asset_path, filename)
            output_path = os.path.join(output_asset_path, filename)
            process_image(source_path, output_path, target_width=asset_resize_width, add_watermark=False)

    print("\n--- 所有處理程序完成！ ---")


if __name__ == '__main__':
    run_processor()
    pass