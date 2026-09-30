(() => {
    "use strict";

    const player = document.getElementById("archive-feature-video");
    const playlist = document.getElementById("archive-feature-playlist");
    const poster = document.getElementById("archive-feature-poster");
    const showcase = player?.closest(".archive-showcase");
    const fullscreenButton = document.getElementById("archive-feature-fullscreen");
    if (!player || !playlist) return;

    const playFeature = (button) => {
        const youtubeId = button?.dataset.youtubeId;
        const videoTitle = button?.dataset.title;
        const embedHost = button?.dataset.embedHost || "www.youtube-nocookie.com";
        if (!youtubeId || !videoTitle) return;

        player.src = `https://${embedHost}/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&controls=0&disablekb=1&iv_load_policy=3`;
        player.title = videoTitle;
        if (poster) poster.hidden = true;
        showcase?.classList.add("is-playing");
    };

    playlist.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-youtube-id]");
        if (!button || !playlist.contains(button)) return;

        playFeature(button);
        playlist.querySelectorAll("button[data-youtube-id]").forEach((item) => {
            const selected = item === button;
            item.classList.toggle("active", selected);
            item.setAttribute("aria-pressed", String(selected));
        });
    });

    poster?.addEventListener("click", () => {
        playFeature(playlist.querySelector("button.active[data-youtube-id]"));
    });

    fullscreenButton?.addEventListener("click", async () => {
        if (!showcase) return;
        if (document.fullscreenElement) {
            await document.exitFullscreen?.();
            return;
        }
        await showcase.requestFullscreen?.();
    });

    document.addEventListener("fullscreenchange", () => {
        const active = document.fullscreenElement === showcase;
        fullscreenButton?.classList.toggle("is-active", active);
        const label = fullscreenButton?.querySelector("span:first-child");
        if (label) label.textContent = active ? "退出全螢幕" : "全螢幕觀看";
    });
})();
