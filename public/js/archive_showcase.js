(() => {
    "use strict";

    const player = document.getElementById("archive-feature-video");
    const playlist = document.getElementById("archive-feature-playlist");
    const poster = document.getElementById("archive-feature-poster");
    if (!player || !playlist) return;

    const playFeature = (button) => {
        const youtubeId = button?.dataset.youtubeId;
        const videoTitle = button?.dataset.title;
        const embedHost = button?.dataset.embedHost || "www.youtube-nocookie.com";
        if (!youtubeId || !videoTitle) return;

        player.src = `https://${embedHost}/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`;
        player.title = videoTitle;
        if (poster) poster.hidden = true;
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
})();
