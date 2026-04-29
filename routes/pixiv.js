import express from "express";
import puppeteer from "puppeteer";

const router = express.Router();

router.get("/search", async (req, res) => {
  const pageNumber = req.query.p || "1";
  const keyword = req.query.q || "AI生成";
  const userId = req.query.userId; // 作者IDを受け取るように追加
  let browser;

  try {
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

    const encodedKeyword = encodeURIComponent(keyword);

    let targetUrl;
    if (userId) {
        // 作者検索の場合
        targetUrl = `https://www.pixiv.net/users/${userId}/artworks?p=${pageNumber}`;
    } else {
        // 通常のタグ検索の場合
        const encodedKeyword = encodeURIComponent(keyword || "AI生成");
        targetUrl = `https://www.pixiv.net/tags/${encodedKeyword}/artworks?mode=r18&s_mode=s_tag_full&p=${pageNumber}`;
    }
    
    console.log(`Fetching: ${targetUrl}`);

    // 1. ページ移動
    await page.goto(targetUrl, { 
        waitUntil: "networkidle2", 
        timeout: 60000 
    });

    await page.waitForSelector('a[href*="/artworks/"]', { timeout: 15000 });

    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 1000; // 1回のスクロール量
            const maxScroll = 8000; // Pixivの1ページ分をカバーする十分な深さ
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;

                // 十分な深さまでスクロールしたら終了
                if (totalHeight >= maxScroll) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200); // 0.2秒おきにスクロール
        });
    });

    // 3. スクロール後、画像要素が整うまで1秒だけ待機
    await new Promise(r => setTimeout(r, 1000));

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
            const rawUrl = img.src || "";
            const displayUrl = rawUrl
                .replace(/\/c\/\d+x\d+[^/]*\//, '/')
                .replace(/\/(custom-thumb|img-obfuscated)\//, '/img-master/')
                .replace(/_(square1200|master1200|custom1200)\.(jpg|png|jpeg|gif)/, '_master1200.jpg');

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

    await browser.close();
    res.json(results);

  } catch (e) {
    if (browser) await browser.close();
    console.error("Pixiv Search Error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;