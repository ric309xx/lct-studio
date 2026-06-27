import subprocess
import sys
import os

REQUIRED_ASSETS = [
    "public/assets/logo-1.png",
    "public/assets/compare/linkou-day.jpg",
    "public/assets/compare/linkou-night.jpg",
    "public/assets/taiwan-aerial-map.webp",
    "public/assets/services/building.jpg",
    "public/assets/services/construction.jpg",
    "public/assets/services/event.jpg",
    "public/assets/services/tourism.jpg",
    "public/assets/story-sunrise-qingjing.webp",
    "public/assets/story-morning-qingjing-cloudsea.webp",
    "public/assets/story-golden-xiluo-silhouette.webp",
    "public/assets/story-sunset-yilan-wujie.webp",
]

def run_git_command(command, ignore_error=False, capture=False):
    print(f"\n> 執行: {' '.join(command)}")
    try:
        return subprocess.run(command, check=True, text=True, capture_output=capture)
    except subprocess.CalledProcessError as e:
        if ignore_error:
            print(f"提示: 指令回傳碼為 {e.returncode} (可能是沒有需要提交的檔案)，繼續執行...")
            return e
        print(f"錯誤: 指令執行失敗 (Error code: {e.returncode})")
        if e.stdout:
            print(e.stdout)
        if e.stderr:
            print(e.stderr)
        # 暫停讓使用者看到錯誤
        input("請按 Enter 鍵結束程式...")
        sys.exit(1)

def ensure_required_assets():
    missing = [path for path in REQUIRED_ASSETS if not os.path.exists(path)]
    if not missing:
        return

    print("\n錯誤: 以下首頁必要素材不存在，先不要上傳，避免正式網站破圖：")
    for path in missing:
        print(f" - {path}")
    input("請按 Enter 鍵結束程式...")
    sys.exit(1)

def has_staged_changes():
    result = subprocess.run(["git", "diff", "--cached", "--quiet"])
    return result.returncode != 0

def main():
    # 因為是放在專案根目錄，不需要切換路徑，直接執行即可
    print("=== LCT Studio Git 自動上傳工具 ===")
    print("當前工作目錄:", os.getcwd())

    ensure_required_assets()
    run_git_command(["git", "status", "--short"])

    # 1. 輸入備註
    commit_message = input("\n請輸入備註內容 (Commit Message): ").strip()
    
    if not commit_message:
        print("備註內容不能為空！")
        input("請按 Enter 鍵結束程式...")
        return

    # 2. git add -A
    run_git_command(["git", "add", "-A"])

    # 3. git commit -m "..."
    if not has_staged_changes():
        print("\n沒有需要提交的變更。")
        input("請按 Enter 鍵關閉視窗...")
        return

    run_git_command(["git", "commit", "-m", commit_message])

    # 4. 固定推到正式 main，避免目前分支沒有 upstream 時失敗
    run_git_command(["git", "push", "origin", "HEAD:main"])

    print("\n=== 全部完成！(Success) ===")
    input("請按 Enter 鍵關閉視窗...")

if __name__ == "__main__":
    main()
