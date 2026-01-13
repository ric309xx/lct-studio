import os
import json
import shutil
from PIL import Image, ImageDraw, ImageFont, ExifTags

# --- 設定區 ---
# 1. 來源與輸出路徑
source_parent_folder = 'photos'
output_parent_folder = 'public'
output_json_file = 'public/photos.json'

# 2. 圖片處理設定 (分別設定寬度)
portfolio_resize_width = 1280  # 作品集照片寬度
asset_resize_width = 300       # 素材照片寬度 (例如個人頭像)
jpeg_quality = 70

# 3. 浮水印設定
watermark_text = "©LCT"
font_file = 'NotoSansTC-Bold.otf' # 請確保此字型檔與 .py 檔在同一目錄
font_size = 72
font_color = (255, 255, 255, 76) # RGBA，A=76 為約 30% 透明度

# 4. 資料夾設定
portfolio_categories = ["城市光影", "大地映像"]
asset_folders = ["assets"]

# 5. 其他設定
supported_extensions = ['.jpg', '.jpeg', '.png', '.gif']
# --- 結束設定 ---


def clean_output():
    """
    (已修正) 刪除舊的 public/photos 和 public/assets 資料夾及 JSON 檔案。
    增加錯誤處理，防止因檔案被占用而閃退。
    """
    print("--- 正在清理舊檔案... ---")
    
    # 統一處理要刪除的資料夾路徑
    paths_to_delete = [os.path.join(output_parent_folder, 'photos')]
    for asset_folder in asset_folders:
        paths_to_delete.append(os.path.join(output_parent_folder, asset_folder))
    
    # 刪除資料夾
    for path in paths_to_delete:
        if os.path.exists(path):
            try:
                shutil.rmtree(path, ignore_errors=True)
                print(f"已嘗試清理資料夾: '{path}'")
            except Exception as e:
                print(f"警告：清理資料夾 '{path}' 時遇到問題 (可能被占用)，將嘗試直接覆寫檔案。")

    # 刪除 JSON 檔案
    if os.path.exists(output_json_file):
        try:
            os.remove(output_json_file)
        except Exception:
            pass
            
    print("清理嘗試完成 (如有錯誤已忽略)。")
    return True


def get_decimal_from_dms(dms, ref):
    """
    將度/分/秒 (DMS) 格式轉換為十進位度數。
    dms: (Degrees, Minutes, Seconds)
    ref: 'N', 'S', 'E', 'W'
    """
    degrees = dms[0]
    minutes = dms[1]
    seconds = dms[2]
    
    decimal = degrees + (minutes / 60.0) + (seconds / 3600.0)
    
    if ref in ['S', 'W']:
        decimal = -decimal
        
    return decimal

def get_gps_info(img):
    """
    從圖片的 EXIF 資料中提取 GPS 經緯度和高度。
    回傳: 包含 lat, lng, alt 的字典，若無資料則回傳 None。
    """
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

        # 提取經緯度需要的標籤 ID
        # 1: GPSLatitudeRef, 2: GPSLatitude, 3: GPSLongitudeRef, 4: GPSLongitude, 6: GPSAltitude
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
            
            # 高度是選擇性的
            if gps_alt is not None:
                # gps_alt 可能是 (numerator, denominator) 或直接是數值
                try:
                    # Pillow 的 IFDRational 處理
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
    """
    使用 Quantize 方法提取圖片的顯著色 (Dominant Color)。
    比單純平均 (Average) 更能反映肉眼看到的「主色」。
    """
    try:
        # 1. 轉為 RGB 並縮小以加速處理
        img_copy = img.copy()
        if img_copy.mode != 'RGB':
            img_copy = img_copy.convert('RGB')
        img_copy.thumbnail((150, 150))

        # 2. 減色處理 (Quantize)，只取主要 5 色
        # 使用 MAXCOVERAGE 或預設算法皆可
        quantized = img_copy.quantize(colors=5, method=Image.MAXCOVERAGE)
        
        # 3. 找出佔比最多的顏色索引
        # getcolors() 回傳 [(count, index), ...]
        counts = quantized.getcolors(maxcolors=256)
        if not counts:
            return (128, 128, 128) # Fallback

        # 排序：數量多的在前面
        counts.sort(key=lambda x: x[0], reverse=True)
        dominant_index = counts[0][1]

        # 4. 從色盤 (Palette) 取出 RGB
        palette = quantized.getpalette()
        r = palette[dominant_index * 3]
        g = palette[dominant_index * 3 + 1]
        b = palette[dominant_index * 3 + 2]
        
        return (r, g, b)
        
    except Exception as e:
        print(f"  ! 計算主色時發生錯誤: {e}, 改用預設灰色")
        return (128, 128, 128)


def process_image(source_path, output_path, target_width, add_watermark=True):
    """
    統一處理單一圖片的函式 (可指定縮放寬度、可選浮水印)。
    (已優化：移除了不必要的 'global font')
    """
    # 注意：'font' 變數是在 run_processor() 中定義的全域變數，
    # 這裡僅為讀取，不需要 'global' 關鍵字。
    try:
        current_gps_info = None # 初始化 GPS 變數
        
        with Image.open(source_path) as img:
            # 1. 先嘗試讀取 GPS 資訊 (在縮放之前)
            current_gps_info = get_gps_info(img)
            if current_gps_info:
                print(f"  * 發現 GPS: {current_gps_info}")

            # 使用傳入的 target_width 進行縮放
            if img.width > target_width:
                aspect_ratio = img.height / img.width
                new_height = int(target_width * aspect_ratio)
                img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)

            # 加上浮水印 (如果需要)
            if add_watermark:
                if img.mode != 'RGBA': img = img.convert('RGBA')
                # 建立一個透明的圖層用於繪製文字
                txt_layer = Image.new('RGBA', img.size, (255, 255, 255, 0))
                draw = ImageDraw.Draw(txt_layer)
                
                # --- 動態計算字體大小 (短邊的 8%) ---
                # 原因：在網頁縮圖(object-cover)時，顯示比例通常取決於短邊。
                # 為了讓浮水印在正方形縮圖中看起來大小一致，需以 min(width, height) 為基準。
                short_side = min(img.width, img.height)
                dynamic_font_size = int(short_side * 0.08)
                if dynamic_font_size < 12: dynamic_font_size = 12 # 最小限制

                try:
                    current_font = ImageFont.truetype(font_file, dynamic_font_size)
                except IOError:
                    print(f"警告: 找不到字型 {font_file}，嘗試使用預設字型。")
                    current_font = ImageFont.load_default()

                # 計算文字位置 (置中)
                # Pillow 9.2.0+ (anchor='mm')
                try:
                    x, y = img.width / 2, img.height / 2
                    draw.text((x, y), watermark_text, font=current_font, fill=font_color, anchor='mm')
                except AttributeError:
                    # 舊版 Pillow 的置中寫法 (如果 anchor='mm' 不支援)
                    text_width, text_height = draw.textsize(watermark_text, current_font)
                    x = (img.width - text_width) / 2
                    y = (img.height - text_height) / 2
                    draw.text((x, y), watermark_text, font=current_font, fill=font_color)

                img = Image.alpha_composite(img, txt_layer)

            # 儲存處理後的圖片
            if output_path.lower().endswith(('.jpg', '.jpeg')):
                if img.mode == 'RGBA': img = img.convert('RGB')
                img.save(output_path, 'JPEG', quality=jpeg_quality, optimize=True)
            else:
                img.save(output_path)
            
            print(f"  - 已處理: {os.path.basename(source_path)} (寬度 -> {img.width}px)")
            
            # --- 改用顯著色算法 (Dominant Color) ---
            dominant_color = get_dominant_color(img)
            
            return True, dominant_color, current_gps_info
            
    except Exception as e:
        print(f"處理檔案 {os.path.basename(source_path)} 時發生錯誤: {e}")
        return False, None, None


def run_processor():
    """主執行函式"""
    
    # (已修正) 執行清理，如果失敗 (回傳 False)，則停止程式
    # (已修正) 執行清理
    clean_output()

    if not os.path.isdir(source_parent_folder):
        print(f"錯誤：找不到來源資料夾 '{source_parent_folder}'。")
        return

    # 確保 public 資料夾存在 (即使沒有照片也該建立)
    os.makedirs(output_parent_folder, exist_ok=True)
    
    # --- 1. 處理作品集分類照片 (加浮水印，寬度 1280px) ---

    all_photo_data = {}
    print("\n--- 正在處理作品集照片 (將加上浮水印與計算顏色) ---")
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

        # 用於追蹤已分派的檔名，確保不重複
        used_filenames = set()

        for filename in files:
            source_path = os.path.join(source_category_path, filename)
            
            # --- 檔名清洗與去重邏輯 ---
            # 1. 分離檔名與副檔名
            name_part, ext = os.path.splitext(filename)
            
            # 2. 清洗: 去除首尾空白
            name_part = name_part.strip()
            
            # 3. 統一副檔名: 小寫，jpeg -> jpg
            ext = ext.lower()
            if ext == '.jpeg': ext = '.jpg'
            
            # 4. 產生候選檔名
            clean_filename = f"{name_part}{ext}"
            final_filename = clean_filename
            
            # 5. 檢查重複並編號 (如: 基隆望幽谷-2.jpg)
            counter = 1
            while final_filename in used_filenames:
                counter += 1
                final_filename = f"{name_part}-{counter}{ext}"
            
            used_filenames.add(final_filename)
            # ---------------------------

            output_path = os.path.join(output_category_path, final_filename)
            
            success, color, gps_info = process_image(source_path, output_path, target_width=portfolio_resize_width, add_watermark=True)
            if success:
                # Store object instead of string
                img_data = {
                    "filename": final_filename, # 使用新的乾淨檔名
                    "color": color # (r, g, b)
                }
                # 如果有 GPS 資訊才加入
                if gps_info:
                    img_data["gps"] = gps_info
                
                all_photo_data[category].append(img_data)

    # 確保 public 資料夾存在 (即使沒有照片也該建立)
    # Write to public/js/data_photos.js (JS format for CORS-free local execution)
    output_js_path = os.path.join(output_parent_folder, 'js', 'data_photos.js')
    try:
        os.makedirs(os.path.dirname(output_js_path), exist_ok=True)
        with open(output_js_path, 'w', encoding='utf-8') as f:
            f.write('window.globalPhotoData = ')
            json.dump(all_photo_data, f, ensure_ascii=False, indent=2)
            f.write(';')
        print(f"Successfully generated JS data file at: {output_js_path}")
    except Exception as e:
        print(f"Error writing to JS file: {e}")

    # Legacy JSON file (optional, keeping for backup if needed, or remove)
    # output_json_path = os.path.join(public_dir, 'photos.json')
    # ... (Removing JSON writing to avoid confusion)
    print("\n--- 正在處理網站素材 (不加浮水印) ---")
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
    # 在程式結束前暫停，方便在終端機查看所有 print 訊息
    # input("請按 Enter 鍵結束...")
    pass