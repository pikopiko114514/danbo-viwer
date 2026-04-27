import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send("No URL provided");

        // URLに gelbooru が含まれているかで判断
        const isGelbooru = targetUrl.includes("gelbooru.com");
        const referer = isGelbooru ? "https://gelbooru.com/" : "https://rule34.xxx/";

        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                "Referer": referer
            }
        });

        const arrayBuffer = await response.arrayBuffer();
        res.set("Content-Type", response.headers.get("content-type"));
        res.send(Buffer.from(arrayBuffer));
    } catch (e) {
        res.status(500).send("Error loading image");
    }
});

export default router;