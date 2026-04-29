import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send("No URL provided");

        // Pixivのリファラ設定
        let referer = "https://rule34.xxx/";
        if (targetUrl.includes("pixiv.net") || targetUrl.includes("pximg.net")) {
            referer = "https://www.pixiv.net/";
        } else if (targetUrl.includes("gelbooru.com")) {
            referer = "https://gelbooru.com/";
        }

        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
                "Referer": referer
            }
        });

        // 失敗した時にコンソールにURLを出してデバッグしやすくする
        if (!response.ok) {
            console.log("❌ 失敗したURL:", targetUrl); // これをターミナルで確認
            return res.status(response.status).send("Fetch failed");
        }

        const arrayBuffer = await response.arrayBuffer();
        res.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
        res.send(Buffer.from(arrayBuffer));
    } catch (e) {
        console.error("Proxy Runtime Error:", e);
        res.status(500).send("Error loading image");
    }
});
export default router;