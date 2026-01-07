import os
import json
import shutil
from PIL import Image, ImageDraw, ImageFont

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
                shutil.rmtree(path)
                print(f"已刪除舊的資料夾: '{path}'")
            except (PermissionError, OSError) as e:
                print(f"\n!!! 錯誤：無法刪除資料夾 '{path}'。")
                print(f"    請檢查是否被其他程式占用。 錯誤訊息: {e}")
                return False # 清理失敗，回傳 False

    # 刪除 JSON 檔案
    if os.path.exists(output_json_file):
        try:
            os.remove(output_json_file)
            print(f"已刪除舊的 JSON 檔案: '{output_json_file}'")
        except (PermissionError, OSError) as e:
            print(f"\n!!! 錯誤：無法刪除 JSON 檔案 '{output_json_file}'。")
            print(f"    請檢查是否被其他程式占用。 錯誤訊息: {e}")
            return False # 清理失敗，回傳 False
            
    print("清理完成。")
    return True # 清理成功，回傳 True


def process_image(source_path, output_path, target_width, add_watermark=True):
    """
    統一處理單一圖片的函式 (可指定縮放寬度、可選浮水印)。
    (已優化：移除了不必要的 'global font')
    """
    # 注意：'font' 變數是在 run_processor() 中定義的全域變數，
    # 這裡僅為讀取，不需要 'global' 關鍵字。
    try:
        with Image.open(source_path) as img:
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
            
            # 計算平均顏色 (Resize to 1x1)
            # 必須使用原始圖片(無浮水印)或處理後的圖片皆可，這裡使用處理後的 img
            # Convert to RGB just in case (e.g. PNG with alpha) for color calculation
            img_for_color = img.convert('RGB')
            img_1x1 = img_for_color.resize((1, 1), Image.Resampling.LANCZOS)
            dominant_color = img_1x1.getpixel((0, 0)) # Returns (r, g, b)
            
            return True, dominant_color
            
    except Exception as e:
        print(f"處理檔案 {os.path.basename(source_path)} 時發生錯誤: {e}")
        return False, None


def run_processor():
    """主執行函式"""
    
    # (已修正) 執行清理，如果失敗 (回傳 False)，則停止程式
    if not clean_output():
        print("\n--- 程式因清理失敗而中止 ---")
        input("請排除錯誤後按 Enter 鍵結束...") # 暫停，讓使用者看到錯誤訊息
        return

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

        for filename in files:
            source_path = os.path.join(source_category_path, filename)
            output_path = os.path.join(output_category_path, filename)
            success, color = process_image(source_path, output_path, target_width=portfolio_resize_width, add_watermark=True)
            if success:
                # Store object instead of string
                all_photo_data[category].append({
                    "filename": filename,
                    "color": color # (r, g, b)
                })

    # 確保 public 資料夾存在 (即使沒有照片也該建立)
    os.makedirs(output_parent_folder, exist_ok=True)
    with open(output_json_file, 'w', encoding='utf-8') as f:
        json.dump(all_photo_data, f, ensure_ascii=False, indent=2)
    print(f"作品集 JSON 清單已寫入 '{output_json_file}'。")

    # --- 2. 處理網站素材 (不加浮水印，寬度 300px) ---
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