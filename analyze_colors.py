import json
import colorsys
import os
import datetime
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm

# Global buffer for log messages
output_buffer = []

def log(message=""):
    print(message)
    output_buffer.append(message)

def get_translated_category(cat):
    """Translate categories to Chinese for display"""
    translations = {
        "Red/Orange (Warm)": "紅/橘色系 (暖色調)",
        "Yellow (Warm)": "黃色系 (暖色調)",
        "Green (Nature)": "綠色系 (自然)",
        "Cyan/Blue (Sky/Water)": "藍/青色系 (天空/海洋)",
        "Purple/Magenta": "紫色/洋紅",
        "Neutral/Grey/Dark": "中性色/黑白灰",
    }
    return translations.get(cat, cat)

def get_stats(items):
    stats = {
        "Red/Orange (Warm)": 0,
        "Yellow (Warm)": 0,
        "Green (Nature)": 0,
        "Cyan/Blue (Sky/Water)": 0,
        "Purple/Magenta": 0,
        "Neutral/Grey/Dark": 0
    }
    
    for item in items:
        r, g, b = item['color']
        h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
        h_deg = h * 360
        
        if s < 0.15: 
            stats["Neutral/Grey/Dark"] += 1
        else:
            if (0 <= h_deg < 40) or (340 <= h_deg <= 360):
                stats["Red/Orange (Warm)"] += 1
            elif 40 <= h_deg < 70:
                stats["Yellow (Warm)"] += 1
            elif 70 <= h_deg < 160:
                stats["Green (Nature)"] += 1
            elif 160 <= h_deg < 260:
                stats["Cyan/Blue (Sky/Water)"] += 1
            elif 260 <= h_deg < 340:
                stats["Purple/Magenta"] += 1
    return stats

def print_stats(title, stats, total_imgs):
    log(f"\n--- {title} (共 {total_imgs} 張) ---")
    for k, v in stats.items():
        percentage = (v / total_imgs * 100) if total_imgs > 0 else 0
        bar = "█" * int(percentage / 5)
        k_zh = get_translated_category(k)
        # Using ljust for alignment in text file (count double width chars)
        # Simple padding approach for console
        log(f"{k_zh:<18}: {bar} {v} ({percentage:.1f}%)")

def generate_pdf(report_path_pdf, lines):
    """Generate PDF using ReportLab"""
    # 1. Register Font
    script_dir = os.path.dirname(os.path.abspath(__file__))
    font_path = os.path.join(script_dir, 'NotoSansTC-VariableFont_wght.ttf')
    
    # Fallback if font not found
    if not os.path.exists(font_path):
        print(f"Warning: Font not found at {font_path}. PDF might not show Chinese correctly.")
        # Try to find bold one or just skip registration to avoid crash
        font_path = os.path.join(script_dir, 'NotoSansTC-Bold.otf')
        if not os.path.exists(font_path):
             print(f"Error: No NotoSansTC font found.")
             return

    try:
        pdfmetrics.registerFont(TTFont('NotoSansTC', font_path))
    except Exception as e:
        print(f"Font registration failed: {e}")
        return

    c = canvas.Canvas(report_path_pdf, pagesize=A4)
    width, height = A4
    c.setFont("NotoSansTC", 12)
    
    y = height - 2 * cm
    line_height = 0.6 * cm
    
    c.drawString(2*cm, y, f"LCT Studio 色調分析報告 (Generated: {datetime.datetime.now().strftime('%Y-%m-%d')})")
    y -= line_height * 2
    
    for line in lines:
        if y < 2 * cm: # New page
            c.showPage()
            c.setFont("NotoSansTC", 12)
            y = height - 2 * cm
        
        # Simple cleanup for unicode bars in PDF if font doesn't support them perfectly, 
        # but NotoSans usually handles them. 
        c.drawString(2*cm, y, line)
        y -= line_height

    c.save()
    print(f"\nPDF Report saved to: {report_path_pdf}")

def analyze_photos():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, 'public', 'photos.json')
    report_path_txt = os.path.join(script_dir, 'color_analysis_report.txt')
    report_path_pdf = os.path.join(script_dir, 'color_analysis_report.pdf')

    log(f"讀取資料來源: {json_path}")
    log(f"報表產生時間: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if not os.path.exists(json_path):
        log("錯誤: 找不到 photos.json。請先執行 generate_photo_list.py。")
        input("請按 Enter 結束...")
        return

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        log(f"讀取 JSON 發生錯誤: {e}")
        input("請按 Enter 結束...")
        return

    # 1. Collect Data
    all_items = []
    
    log("\n" + "="*30)
    log("      詳細分析 (Detailed Analysis)      ")
    log("="*30)

    for category, items in data.items():
        if category == "assets": continue
        all_items.extend(items)
        cat_stats = get_stats(items)
        print_stats(category, cat_stats, len(items))

    # 2. Total Stats
    total_stats = get_stats(all_items)
    print_stats("所有照片總計 (All Photos)", total_stats, len(all_items))

    # 3. Recommendations (Chinese)
    log("\n" + "="*30)
    log("      拍攝建議與推薦 (Recommendations)      ")
    log("="*30)
    
    total_imgs = len(all_items)
    found_missing = False
    
    if total_stats["Red/Orange (Warm)"] + total_stats["Yellow (Warm)"] < (total_imgs * 0.2):
        log("\n[缺乏] 暖色調 (紅/橘/黃)")
        log("  -> 建議拍攝: 夕陽、廟宇建築、夜市燈火、紅磚老街、秋天楓紅。")
        found_missing = True
    
    if total_stats["Cyan/Blue (Sky/Water)"] < (total_imgs * 0.2):
        log("\n[缺乏] 藍色調")
        log("  -> 建議拍攝: 晴朗藍天、海洋、現代玻璃帷幕建築、藍調時刻(Blue Hour)。")
        found_missing = True
        
    if total_stats["Green (Nature)"] < (total_imgs * 0.2):
         log("\n[缺乏] 綠色調")
         log("  -> 建議拍攝: 森林、山脈、公園綠地、稻田或茶園。")
         found_missing = True
         
    if total_stats["Purple/Magenta"] < (total_imgs * 0.05):
        log("\n[缺乏] 紫色/洋紅")
        log("  -> 建議拍攝: 城市霓虹燈 (賽博龐克風)、繡球花/薰衣草花田、日出霞光。")
        found_missing = True
        
    if not found_missing:
        log("\n太棒了！您的作品集色彩分佈非常均衡。")

    log("\n" + "="*30)
    
    # 4. Save Logs to Files
    # Save TXT
    try:
        with open(report_path_txt, 'w', encoding='utf-8') as f:
            f.write('\n'.join(output_buffer))
        print(f"\n文字報表已儲存至: {report_path_txt}")
    except Exception as e:
        print(f"\n儲存文字報表失敗: {e}")

    # Generate PDF
    generate_pdf(report_path_pdf, output_buffer)

    input("\n分析完成。請按 Enter 鍵關閉視窗...")

if __name__ == "__main__":
    analyze_photos()
