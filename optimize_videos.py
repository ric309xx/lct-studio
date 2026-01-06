import os
import subprocess
import shutil

video_dir = r'd:\12_網頁\01_LCT\background'
videos = ['your-hero-video1.mp4', 'your-hero-video2.mp4', 'your-hero-video3.mp4', 'your-hero-video4.mp4']

print(f"Processing videos in {video_dir}...")

for v in videos:
    original_input_path = os.path.join(video_dir, v)
    backup_path = os.path.join(video_dir, f"{os.path.splitext(v)[0]}_original.mp4")
    
    # Backup logic: 
    # If backup exists, use IT as input (because original_input_path might handle be overwritten or already processed)
    # If backup doesn't exist, move original to backup, then use backup as input.
    
    input_source = ""
    
    if os.path.exists(backup_path):
        print(f"Backup found for {v}, using backup as source.")
        input_source = backup_path
    else:
        if os.path.exists(original_input_path):
            print(f"Backing up {v}...")
            shutil.move(original_input_path, backup_path)
            input_source = backup_path
        else:
            print(f"Warning: {v} not found!")
            continue

    base_name = os.path.splitext(v)[0]
    poster_path = os.path.join(video_dir, f"{base_name}.jpg")
    webm_path = os.path.join(video_dir, f"{base_name}.webm")
    mp4_path = os.path.join(video_dir, f"{base_name}.mp4") # This replaces the original file location

    print(f"Optimizing {base_name}...")

    # 1. Poster (First frame)
    # -vframes 1: Grab 1 frame
    # -q:v 2: High quality Jpeg
    cmd_poster = ['ffmpeg', '-y', '-i', input_source, '-ss', '00:00:00', '-vframes', '1', '-q:v', '2', poster_path]
    subprocess.run(cmd_poster, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  -> Generated Poster: {os.path.basename(poster_path)}")
    
    # 2. WebM (VP9)
    # -vf scale=-2:720 : Resize to 720p height, width auto-scaled (divisible by 2)
    # -an : Remove audio
    # -b:v 1500k : Target bitrate 1.5Mbps
    cmd_webm = ['ffmpeg', '-y', '-i', input_source, '-vf', 'scale=-2:720', '-c:v', 'libvpx-vp9', '-b:v', '1500k', '-an', webm_path]
    subprocess.run(cmd_webm, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  -> Generated WebM: {os.path.basename(webm_path)}")

    # 3. MP4 (H.264)
    # -c:v libx264
    # -pix_fmt yuv420p : Ensure compatibility
    cmd_mp4 = ['ffmpeg', '-y', '-i', input_source, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-b:v', '1800k', '-pix_fmt', 'yuv420p', '-an', mp4_path]
    subprocess.run(cmd_mp4, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"  -> Generated MP4: {os.path.basename(mp4_path)}")

print("\nAll videos optimized!")
