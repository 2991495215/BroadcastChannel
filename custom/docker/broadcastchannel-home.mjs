import { r as __exportAll } from "./rolldown-runtime_CE-6LUnI.mjs";
import { b as unescapeHTML, d as renderTemplate, i as renderComponent } from "./server_BU6LzewH.mjs";
import { t as createComponent } from "./compiler_Corechrc.mjs";
import { t as $$PostsPage } from "./PostsPage_D8gt0Xxj.mjs";
import { readFileSync } from "node:fs";
//#region src/pages/index.astro
var pages_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	url: () => ""
});
var $$Index = createComponent(async ($$result, $$props, $$slots) => {
	// Local archive fallback only; live all/selected views read the backend JSON.
    let history = [];
    try { history = JSON.parse(readFileSync("/app/dist/client/news-data/channel-history.json", "utf8")).items; } catch {}
    const escape = value => String(value || "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
    const channel = {title: "前沿消息", description: "论坛全量与 AI 精选", posts: history.slice(0, 20).map(item => ({
        id: item.id, title: item.title, datetime: /^\d{4}-\d{2}-\d{2} /.test(item.published) ? item.published.replace(" ", "T") + "+08:00" : item.published || "1970-01-01T00:00:00Z",
        content: '<div class="link_preview_site_name">' + escape(item.source) + '</div><div class="link_preview_description">' + escape(item.summary) + '</div>', tags: [],
    }))};
    try {
        // shortcut: compiled chunk names belong to the pinned image; recheck on image upgrades.
        let html = readFileSync("/app/dist/client/qianyan/index.html", "utf8")
            .replace(/(src|href)="\/(theme\.js|previous\.css|broadcastchannel\.js)"/g, '$1="/qianyan/$2?v=20261018-3"');
        const fallback = channel.posts.map(post => '<article class="post-entry"><div class="hn-story"><h2><a href="/posts/' + encodeURIComponent(post.id) + '">' + escape(post.title) + '</a></h2></div><div class="post-meta"><time datetime="' + escape(post.datetime) + '">' + escape(post.datetime) + '</time></div><div class="post-content content">' + post.content + '</div></article>').join('');
        if (fallback) html = html.replace('<p class="feed-empty">正在读取前沿消息…</p>', fallback);
        return renderTemplate`${unescapeHTML(html)}`;
    } catch (error) {
        console.error("Homepage template unavailable; serving channel history", error.message);
    }
	return renderTemplate`${renderComponent($$result, "PostsPage", $$PostsPage, {
		"channel": channel,
		"after": false,
		"pageClass": "feed",
		"pageHeading": channel.title,
		"pageType": "home"
	})}`;
}, "/app/src/pages/index.astro", void 0);
var $$file = "/app/src/pages/index.astro";
//#endregion
//#region \0virtual:astro:page:src/pages/index@_@astro
var page = () => pages_exports;
//#endregion
export { page };
