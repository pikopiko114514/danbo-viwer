import express from "express";
import fetch from "node-fetch";

const router = express.Router();
const COOKIE = process.env.PIXIV_COOKIE;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.get("/search", async (req, res) => {
  const keyword = req.query.q || "";
  const minLikes = parseInt(req.query.minLikes, 10) || 0;
  const page = parseInt(req.query.p, 10) || 1;

  try {
    const searchRes = await fetch(
      `https://www.pixiv.net/ajax/search/artworks/${encodeURIComponent(keyword)}?p=${page}&mode=r18&ai=1`,
      {
        headers: { 
          Cookie: COOKIE, 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
          "Referer": "https://www.pixiv.net/"
        },
      }
    );

    const data = await searchRes.json();
    const items = data.body?.illustManga?.data || data.body?.artworks?.data || [];

    const foundItems = [];
    for (const item of items) {
      try {
        const detailRes = await fetch(`https://www.pixiv.net/ajax/illust/${item.id}`, {
          headers: { Cookie: COOKIE, "User-Agent": "Mozilla/5.0" }
        });
        
        if (detailRes.ok) {
          const body = (await detailRes.json()).body;
          if (body.aiType === 2 && body.xRestrict > 0 && (body.bookmarkCount || 0) >= minLikes) {
            foundItems.push({
              id: item.id,
              url: body.urls.regular,
              originalUrl: body.urls.original,
              score: body.bookmarkCount,
              tags: body.tags.tags.map(t => t.tag).join(' '),
              isPixiv: true
            });
          }
        }
      } catch (err) {}
      await sleep(500); 
    }
    res.json(foundItems);
  } catch (e) {
    res.status(500).json({ error: "Pixiv API Error" });
  }
});

export default router;