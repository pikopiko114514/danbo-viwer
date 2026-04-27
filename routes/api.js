import express from "express";
import fetch from "node-fetch";

const router = express.Router();
router.get("/search", async (req, res) => {
    const keyword = req.query.q || "";
    const page = parseInt(req.query.p, 10) || 0;
    const minScore = parseInt(req.query.s, 10) || 0;
    const site = req.query.site || "rule34";

    try {
        let tagQuery = keyword.trim();
        if (minScore > 0) tagQuery += (tagQuery ? " " : "") + `score:>=${minScore}`;

        let url = "";
        if (site === "gelbooru") {
            // ★ Gelbooru用の環境変数を使用
            const API_KEY = process.env.GEL_API_KEY;
            const USER_ID = process.env.GEL_USER_ID;
            
            url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tagQuery)}&pid=${page}&limit=20&api_key=${API_KEY}&user_id=${USER_ID}`;

        } else {
            // Rule34用
            const API_KEY = process.env.BOORU_API_KEY;
            const USER_ID = process.env.BOORU_USER_ID;
            url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tagQuery)}&pid=${page}&limit=20&api_key=${API_KEY}&user_id=${USER_ID}`;
        }

        const response = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" }
        });
        
        const text = await response.text();
        
        // デバッグ用：もし動かない場合はサーバー側のコンソールを見てください
        if (!response.ok) {
            console.error(`Fetch Error (${site}):`, text);
            return res.json([]);
        }

        const rawData = JSON.parse(text);
        const posts = Array.isArray(rawData) ? rawData : (rawData.post || []);

        const results = posts.map(post => ({
            id: post.id,
            url: post.file_url,
            previewUrl: post.preview_url,
            score: post.score || 0,
            tags: post.tags,
            createdAt: post.created_at || (post.change ? post.change * 1000 : null)
        }));
        
        res.json(results);
    } catch (e) {
        console.error("API Error:", e.message);
        res.json([]);
    }
});
export default router;