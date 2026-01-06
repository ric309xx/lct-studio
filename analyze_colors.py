import json
import colorsys
import os

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
        
        # Convert to HSV
        h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
        h_deg = h * 360
        
        # Categorize
        if s < 0.15: 
            # Low saturation = Neutral/Grey/Dark
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
    print(f"\n--- {title} (Total: {total_imgs}) ---")
    for k, v in stats.items():
        percentage = (v / total_imgs * 100) if total_imgs > 0 else 0
        bar = "█" * int(percentage / 5)
        print(f"{k:<25}: {bar} {v} ({percentage:.1f}%)")

def analyze_photos():
    # Determine the directory where the script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, 'public', 'photos.json')

    print(f"Reading data from: {json_path}")

    if not os.path.exists(json_path):
        print("Error: photos.json not found. Please run generate_photo_list.py first.")
        input("Press Enter to exit...")
        return

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading JSON: {e}")
        input("Press Enter to exit...")
        return

    # 1. Total Stats
    all_items = []
    
    # 2. Category Stats
    print("\n" + "="*30)
    print("      DETAILED ANALYSIS      ")
    print("="*30)

    for category, items in data.items():
        if category == "assets": continue
        all_items.extend(items)
        
        # Analyze specific category
        cat_stats = get_stats(items)
        print_stats(category, cat_stats, len(items))

    # Analyze Total
    total_stats = get_stats(all_items)
    print_stats("ALL PHOTOS", total_stats, len(all_items))

    # Recommendation Logic (Based on Total)
    print("\n" + "="*30)
    print("      RECOMMENDATIONS      ")
    print("="*30)
    
    total_imgs = len(all_items)
    found_missing = False
    
    if total_stats["Red/Orange (Warm)"] + total_stats["Yellow (Warm)"] < (total_imgs * 0.2):
        print("\n[MISSING] Warm Tones (Red/Orange/Yellow)")
        print("  -> Suggestion: Sunsets, Temples, Night Markets, Red Brick Architecture.")
        found_missing = True
    
    if total_stats["Cyan/Blue (Sky/Water)"] < (total_imgs * 0.2):
        print("\n[MISSING] Blue Tones")
        print("  -> Suggestion: Clear Blue Skies, Ocean Views, Modern Glass Architecture.")
        found_missing = True
        
    if total_stats["Green (Nature)"] < (total_imgs * 0.2):
         print("\n[MISSING] Green Tones")
         print("  -> Suggestion: Forests, Mountains, Parks, Tea Plantations.")
         found_missing = True
         
    if total_stats["Purple/Magenta"] < (total_imgs * 0.05):
        print("\n[MISSING] Purple/Magenta")
        print("  -> Suggestion: Neon lights (Cyberpunk style), Flower fields (Lavender/Hydrangea), Sunrises.")
        found_missing = True
        
    if not found_missing:
        print("\nGreat variety! Your portfolio has a balanced color distribution.")

    print("\n" + "="*30)
    input("\nAnalysis complete. Press Enter to close...")

if __name__ == "__main__":
    analyze_photos()
