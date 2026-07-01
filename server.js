const express = require('express');
const app = express();

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const cacheDatabase = {};

// Fallback hardcoded recommendations to display if external APIs time out
const fallbackTracks = [
    "Save Your Tears by The Weeknd",
    "As It Was by Harry Styles",
    "Physical by Dua Lipa",
    "Starboy by The Weeknd",
    "Levitating by Dua Lipa"
];

app.get('/recommend', async (req, res) => {
    try {
        const { song, artist } = req.query;

        if (!song || !artist) {
            return res.status(400).json({ error: "Missing song or artist parameters." });
        }

        // Clean user strings safely
        const cleanSong = song.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const cleanArtist = artist.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const cacheKey = `${cleanSong}-${cleanArtist}`.toLowerCase();

        // 1. Check cache database memory first
        if (cacheDatabase[cacheKey]) {
            return res.json({ source: "cache_memory", recommendations: cacheDatabase[cacheKey] });
        }

        // 2. Safely extract song data from MusicBrainz
        const searchUrl = `https://musicbrainz.org{encodeURIComponent(cleanSong)}%20AND%20artist:${encodeURIComponent(cleanArtist)}&fmt=json&limit=1`;
        
        const searchResponse = await fetch(searchUrl, { 
            headers: { 'User-Agent': 'FreeMusicDiscoveryEngine/2.0.0 (contact@example.com)' } 
        });
        
        if (!searchResponse.ok) {
            throw new Error("MusicBrainz network down.");
        }

        const searchData = await searchResponse.json();
        
        // SAFE PARSING: Prevents the server from crashing if structural changes occur
        if (!searchData || !searchData.recordings || searchData.recordings.length === 0) {
            return res.json({ source: "fallback_database", recommendations: fallbackTracks });
        }

        const mbid = searchData.recordings[0].id;
        if (!mbid) {
            return res.json({ source: "fallback_database", recommendations: fallbackTracks });
        }

        // 3. Extract crowdsourced listener metrics via ListenBrainz
        const recommendUrl = `https://listenbrainz.org{mbid}/similar-recordings`;
        const recommendResponse = await fetch(recommendUrl);
        
        if (!recommendResponse.ok) {
            return res.json({ source: "fallback_database", recommendations: fallbackTracks });
        }

        const recommendData = await recommendResponse.json();
        const tracks = recommendData?.payload?.recordings || [];

        // Map and extract tracks into simple text lines
        const recommendations = tracks.slice(0, 5).map(track => {
            return `${track.recording_name || "Unknown Track"} by ${track.artist_name || "Unknown Artist"}`;
        });

        if (recommendations.length > 0) {
            cacheDatabase[cacheKey] = recommendations;
            return res.json({ source: "listenbrainz_crowdsourced_data", recommendations });
        } else {
            return res.json({ source: "fallback_database", recommendations: fallbackTracks });
        }

    } catch (error) {
        console.error("Internal Server Error caught cleanly:", error);
        // CRASH PROTECTION: Always return valid data to the browser, even if everything breaks
        return res.json({ source: "emergency_fallback", recommendations: fallbackTracks });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server executing safely on port ${PORT}`);
});
