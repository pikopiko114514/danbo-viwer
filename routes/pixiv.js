import express from "express";
import puppeteer from "puppeteer";
import rateLimit from "express-rate-limit";

const router = express.Router();

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10分

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1分
  max: 20,
  message: {
    error: "Too many requests. Please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false
});

router.get("/search", limiter, async (req, res) => {
  const pageNumber = req.query.p || "1";
  const keyword = req.query.q || "AI生成";
  const userId = req.query.userId; // 作者IDを受け取るように追加
  let browser;
  const encodedKeyword = encodeURIComponent(keyword);

  try {
    const cacheKey = `${keyword}-${pageNumber}-${userId || "tag"}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log("Cache hit:", cacheKey);
        return res.json(cached.data);
    }
    
    browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Cookieセット
    if (process.env.PIXIV_COOKIE) {
        await page.setCookie({
            name: "PHPSESSID",
            value: process.env.PIXIV_COOKIE.replace("PHPSESSID=", ""),
            domain: ".pixiv.net",
            path: "/",
            secure: true,
            httpOnly: true
        });
    }

    let targetUrl;
    if (userId) {
        // 作者検索の場合
        targetUrl = `https://www.pixiv.net/users/${userId}/artworks?p=${pageNumber}`;
    } else {
        // 通常のタグ検索の場合
        targetUrl = `https://www.pixiv.net/tags/${encodedKeyword}/artworks?mode=r18&s_mode=s_tag_full&p=${pageNumber}`;
    }
    
    console.log(`Fetching: ${targetUrl}`);

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");
     
    await page.setRequestInterception(true);

    page.on("request", (req) => {
    const type = req.resourceType();

    if (["image", "media", "font"].includes(type)) {
        req.abort();
    } else {
        req.continue();
    }
    });

    await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000
    });

    await page.waitForSelector('a[href*="/artworks/"]', { timeout: 15000 });

    for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(r => setTimeout(r, 500));
    }

    const results = await page.evaluate(() => {
        // 1. 作品の親要素を取得
        const items = Array.from(document.querySelectorAll('[data-gtm-value][data-gtm-user-id]'));

        return items.map(item => {
            const id = item.getAttribute('data-gtm-value');
            const userId = item.getAttribute('data-gtm-user-id');
            const img = item.querySelector('img');
            
            if (!img || !id) return null;

            // --- 枚数 (pageCount) の抽出 ---
            // 貼り付けていただいたアイコン（path[d^="M8,3"]）を持つ要素を探す
            let pageCount = 1;
            
            // アイコンが含まれる親要素（通常は枚数表示のバッジ）を探す
            const svgIcon = item.querySelector('svg path[d^="M8,3"]');
            if (svgIcon) {
                // SVGの近くにあるテキスト（数字）を抽出
                const countText = svgIcon.closest('div').innerText.trim();
                const count = parseInt(countText);
                if (!isNaN(count)) {
                    pageCount = count;
                }
            } else {
                // 予備：SVGが見つからない場合、数字だけの要素を探す
                const possibleBadges = Array.from(item.querySelectorAll('span, div'));
                for (const b of possibleBadges) {
                    if (/^\d+$/.test(b.innerText.trim()) && b.innerText.length < 4) {
                        pageCount = parseInt(b.innerText);
                        break;
                    }
                }
            }

            // --- 作者名の抽出 ---
            const altText = img.alt || "";
            let userName = "不明";
            if (altText.includes(' - ')) {
                const parts = altText.split(' - ');
                userName = parts[parts.length - 1].replace(/の(イラスト|マンガ|小説)$/, "");
            }

            // --- 画像URLの整形 ---
            const rawUrl =
                img.src ||
                img.getAttribute("src") ||
                img.getAttribute("data-src") ||
                img.getAttribute("srcset")?.split(" ")[0] ||
                "";

            const displayUrl = rawUrl

            return {
                id: id,
                url: displayUrl,
                tags: altText,
                pageCount: pageCount,
                date: rawUrl.match(/\/img\/(\d{4}\/\d{2}\/\d{2})\//)?.[1] || "",
                userName: userName,
                userId: userId,
                isPixiv: true
            };
        }).filter(Boolean);
    });

    cache.set(cacheKey, {
    data: results,
    timestamp: Date.now()
    });

   res.json(results);
  } catch (e) {
    console.error("Pixiv Search Error:", e);
    res.status(500).json({
    error: "Pixiv fetch failed",
    detail: e.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

export default router;