import subprocess
import sys
import os

def run_git_command(command):
    print(f"\n> 執行: {command}")
    try:
        # shell=True 讓指令在 Shell 中執行，支援環境變數等
        subprocess.run(command, check=True, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"錯誤: 指令執行失敗 (Error code: {e.returncode})")
        # 暫停讓使用者看到錯誤
        input("請按 Enter 鍵結束程式...")
        sys.exit(1)

def main():
    # 因為是放在專案根目錄，不需要切換路徑，直接執行即可
    print("=== LCT Studio Git 自動上傳工具 ===")
    print("當前工作目錄:", os.getcwd())

    # 1. 輸入備註
    commit_message = input("\n請輸入備註內容 (Commit Message): ").strip()
    
    if not commit_message:
        print("備註內容不能為空！")
        input("請按 Enter 鍵結束程式...")
        return

    # 2. git add .
    run_git_command("git add .")

    # 3. git commit -m "..."
    # 處理雙引號，避免指令錯誤
    safe_message = commit_message.replace('"', '\\"')
    run_git_command(f'git commit -m "{safe_message}"')

    # 4. git push
    run_git_command("git push")

    print("\n=== 全部完成！(Success) ===")
    input("請按 Enter 鍵關閉視窗...")

if __name__ == "__main__":
    main()
