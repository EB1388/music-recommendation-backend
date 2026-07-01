const express = require('express');
const app = express();

// SECURITY: Allows your mobile app or frontend website to talk to this backend safely
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// CACHE: Temporary local storage to save your request budget
const cacheDatabase = {};

app.get('/recommend', async (req, res) => {
    try {
        const { song, artist } = req.query;

        // 1. INPUT SANITISATION: Keep your server secure from malicious code inputs
        if (!song || !artist) {
            return res.status(400).json({ error: "Missing song or artist parameters." });
        }
        const cleanSong = song.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const cleanArtist = artist.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const cacheKey = `${cleanSong}-${cleanArtist}`.toLowerCase();

        // 2. CHECK CACHE: Serve immediately if another user already searched this song
        if (cacheDatabase[cacheKey]) {
            console.log("Serving from backend memory cache...");
            return res.json({ source: "cache", recommendations: cacheDatabase[cacheKey] });
        }

        // 3. RATE LIMIT DELAY: Inject a 2.5 second safe delay so the internet doesn't block your server
        await new Promise(resolve => setTimeout(resolve, 2500));

        // 4. MUSICBRAINZ API: Look up the song's unique internet identifier (MBID)
        const searchUrl = `https://musicbrainz.org{encodeURIComponent(cleanSong)}%20AND%20artist:${encodeURIComponent(cleanArtist)}&fmt=json&limit=1`;
        const searchResponse = await fetch(searchUrl, { headers: { 'User-Agent': 'MyFreeMusicApp/1.0.0 (contact@example.com)' } });
        const searchData = await searchResponse.json();

        const mbid = searchData.recordings?.[0]?.id;
        if (!mbid) {
            return res.json({ source: "fallback", recommendations: [`Other hits by ${cleanArtist}`] });
        }

        // 5. LISTENBRAINZ API: Pull recommendations based on real human listening data using the MBID
        const recommendUrl = `https://listenbrainz.org{mbid}/similar-recordings`;
        const recommendResponse = await fetch(recommendUrl);
        const recommendData = await recommendResponse.json();

        // Extract song names from the human listening data response
        const tracks = recommendData.payload?.recordings || [];
        const recommendations = tracks.slice(0, 5).map(track => `${track.recording_name} by ${track.artist_name}`);

        if (recommendations.length > 0) {
            cacheDatabase[cacheKey] = recommendations; // Save to memory cache
            return res.json({ source: "listenbrainz_human_data", recommendations });
        } else {
            return res.json({ source: "fallback", recommendations: [`Popular tracks near the genre of ${cleanSong}`] });
        }

    } catch (error) {
        console.error("Server processing error:", error);
        return res.status(500).json({ error: "Recommendation engine temporarily busy." });
    }
});

// Dynamically use the cloud provider's network port, default to 8000 locally
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server running live on port ${PORT}`);
});
