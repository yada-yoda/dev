/* Stage Wire - client-side filtering and the archive table.
 *
 * The index ships every published story as JSON in the page and filters in
 * the browser. There are a couple of hundred stories at most, the whole set
 * is smaller than one of the photographs on it, and filtering this way means
 * no build step per filter combination and no server.
 *
 * Filter state lives in the URL query, so a filtered view can be linked,
 * bookmarked and reloaded. The back button works because each change is a
 * replaceState on the same entry rather than a new one - a filter is not a
 * page you navigated to.
 */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* A name as a URL segment. Must produce exactly what render.py's slug()
   * produces, or a chip on the index links to a page that does not exist.
   * Accents are folded rather than encoded, so the address stays readable -
   * /who/denee-benton/ rather than a percent-encoded mess. */
  function nameSlug(name) {
    return String(name || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  /* ---- toast ---------------------------------------------------------- */

  var toastEl = null, toastHide = null, toastShow = null;
  function toast(msg) {
    toastEl = toastEl || document.getElementById("toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastShow);
    // A timeout rather than requestAnimationFrame: rAF does not run in a
    // background tab, which would leave the toast invisible but present.
    toastShow = setTimeout(function () { toastEl.classList.add("on"); }, 20);
    clearTimeout(toastHide);
    toastHide = setTimeout(function () {
      toastEl.classList.remove("on");
      setTimeout(function () { toastEl.hidden = true; }, 200);
    }, 1800);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.preventDefault();
    var url = btn.getAttribute("data-copy") || location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { toast("Link copied"); },
        function () { toast("Could not copy"); }
      );
    } else {
      toast("Could not copy");
    }
  });

  /* ---- broken hotlinks ------------------------------------------------ */
  // These images sit on the outlets' own servers. When one moves or blocks
  // off-site requests the figure removes itself, so a dead photo never
  // leaves a grey hole in the middle of a story.
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img && img.tagName === "IMG" && img.closest(".shot")) {
      var fig = img.closest(".shot");
      if (fig) fig.remove();
    }
  }, true);

  /* ---- relative time -------------------------------------------------- */

  function ago(iso) {
    var then = new Date(iso);
    if (isNaN(then)) return "";
    var mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 60) return mins <= 1 ? "just now" : mins + " min ago";
    var hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    var days = Math.round(hours / 24);
    if (days < 14) return days + (days === 1 ? " day ago" : " days ago");
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  document.querySelectorAll("[data-ago]").forEach(function (el) {
    var t = ago(el.getAttribute("data-ago"));
    if (t) el.textContent = t;
  });

  /* ---- index filtering ------------------------------------------------ */

  var listEl = document.getElementById("stories");
  if (listEl && window.WIRE) {
    initIndex(window.WIRE);
  }

  function initIndex(stories) {
    var params = new URLSearchParams(location.search);
    var state = {
      city: params.get("city") || "all",
      tier: params.get("tier") || "all",
      type: params.get("type") || "all",
      // Celebrities-only is on unless the URL explicitly turns it off, which
      // is the default the section was designed around.
      celebs: params.get("celebs") !== "off"
    };

    var cityChips = document.querySelectorAll("[data-city]");
    var tierSel = document.getElementById("f-tier");
    var typeSel = document.getElementById("f-type");
    var celebTog = document.getElementById("f-celebs");
    var countEl = document.getElementById("count");
    var alsoWrap = document.getElementById("also");
    var alsoList = document.getElementById("also-list");

    function matches(s) {
      if (state.city !== "all" && s.city !== state.city) return false;
      if (state.tier !== "all" && s.tier !== state.tier) return false;
      if (state.type !== "all" && s.type !== state.type) return false;
      return true;
    }

    function render() {
      var passing = stories.filter(matches);
      var withNames = passing.filter(function (s) { return s.celebs && s.celebs.length; });
      var without = passing.filter(function (s) { return !s.celebs || !s.celebs.length; });
      var shown = state.celebs ? withNames : passing;

      // Chicago rarely produces a nationally famous name, so Chicago plus
      // celebrities-only is an empty page - on a filter that is half the
      // reason this section exists. Rather than show nothing, fall back to
      // every matching story and say why. The toggle is a preference about
      // ordering attention, not an instruction to show a blank page.
      var relaxed = false;
      if (state.celebs && !withNames.length && passing.length) {
        shown = passing;
        relaxed = true;
      }

      listEl.innerHTML = shown.length
        ? (relaxed
            ? '<p class="empty">No story here names someone the fame check ' +
              'recognised, so every story is shown instead.</p>'
            : "") + shown.map(storyHtml).join("")
        : '<p class="empty">Nothing matches those filters. Try widening them, or ' +
          '<a href="?celebs=off">show every story</a>.</p>';

      document.querySelectorAll("[data-ago]").forEach(function (el) {
        var t = ago(el.getAttribute("data-ago"));
        if (t) el.textContent = t;
      });

      countEl.textContent = shown.length + (shown.length === 1 ? " story" : " stories") +
        (state.celebs && !relaxed && without.length
          ? ", " + without.length + " more without a recognised name" : "");

      // The strip under the list exists so the celebrities-only default never
      // silently hides real news - it says what it is holding back. When the
      // list has already been relaxed to show everything, there is nothing
      // being held back and the strip would just repeat the page.
      if (state.celebs && !relaxed && without.length) {
        alsoWrap.hidden = false;
        alsoList.innerHTML = without.slice(0, 12).map(function (s) {
          return '<li><a href="s/' + esc(s.id) + '/">' + esc(s.title) + "</a> " +
            '<span class="why">' + esc(s.city || "") + "</span></li>";
        }).join("");
      } else {
        alsoWrap.hidden = true;
      }

      var q = new URLSearchParams();
      if (state.city !== "all") q.set("city", state.city);
      if (state.tier !== "all") q.set("tier", state.tier);
      if (state.type !== "all") q.set("type", state.type);
      if (!state.celebs) q.set("celebs", "off");
      var qs = q.toString();
      history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    }

    function storyHtml(s) {
      var bits = [];
      bits.push('<article class="story">');
      bits.push('<p class="meta">');
      if (s.city) bits.push('<span class="city">' + esc(s.city) + "</span>");
      if (s.tier && s.tier !== s.city) bits.push("<span>" + esc(s.tier) + "</span>");
      if (s.type) bits.push("<span>" + esc(s.type) + "</span>");
      bits.push('<span data-ago="' + esc(s.published) + '"></span>');
      bits.push("</p>");
      bits.push('<h2><a href="s/' + esc(s.id) + '/">' + esc(s.title) + "</a></h2>");

      if (s.image) {
        bits.push('<figure class="shot"><img src="' + esc(s.image) + '" alt="" ' +
          'loading="lazy" referrerpolicy="no-referrer-when-downgrade">' +
          '<figcaption>' + esc(s.imageCredit) + "</figcaption></figure>");
      }

      if (s.celebs && s.celebs.length) {
        bits.push('<p class="celebs">' + s.celebs.map(function (c) {
          return '<a class="who' + (c.watched ? " watched" : "") + '" href="who/' +
            esc(nameSlug(c.name)) + '/" title="Every story naming ' + esc(c.name) + '">' +
            esc(c.name) + (c.knownFor ? " <i>" + esc(c.knownFor) + "</i>" : "") + "</a>";
        }).join("") + "</p>");
      }

      if (s.quote) {
        bits.push("<blockquote>" + esc(s.quote) +
          (s.quoteSource ? ' <cite>&mdash; ' + esc(s.quoteSource) + "</cite>" : "") +
          "</blockquote>");
      }

      var facts = [];
      if (s.venue) facts.push(esc(s.venue));
      if (s.show) facts.push(esc(s.show));
      if (s.sources && s.sources.length > 1) facts.push(s.sources.length + " outlets");
      if (facts.length) bits.push('<p class="facts">' + facts.join(" &middot; ") + "</p>");

      if (s.sources && s.sources.length) {
        bits.push('<p class="srcs">' + s.sources.slice(0, 3).map(function (src) {
          // Say when a link travels through Google News rather than straight
          // to the outlet named on it - about three in five of them do.
          var via = (src.url || "").indexOf("news.google.com") >= 0
            ? ' <span class="why">via Google News</span>' : "";
          return '<a href="' + esc(src.url) + '" rel="nofollow noopener" target="_blank">' +
            esc(src.name) + "</a>" + via;
        }).join("") + "</p>");
      }

      bits.push("</article>");
      return bits.join("");
    }

    cityChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.city = chip.getAttribute("data-city");
        cityChips.forEach(function (c) {
          c.classList.toggle("on", c.getAttribute("data-city") === state.city);
        });
        render();
      });
      chip.classList.toggle("on", chip.getAttribute("data-city") === state.city);
    });

    tierSel.value = state.tier;
    typeSel.value = state.type;
    celebTog.checked = state.celebs;

    tierSel.addEventListener("change", function () { state.tier = tierSel.value; render(); });
    typeSel.addEventListener("change", function () { state.type = typeSel.value; render(); });
    celebTog.addEventListener("change", function () { state.celebs = celebTog.checked; render(); });

    render();
  }

  /* ---- archive table -------------------------------------------------- */

  var table = document.getElementById("archive");
  if (table) initArchive(table);

  function initArchive(tbl) {
    var STORE = "wire.archive.cols";
    var sortKey = "published", sortDir = -1;

    var headers = [].slice.call(tbl.querySelectorAll("th"));
    var body = tbl.querySelector("tbody");
    var rows = [].slice.call(body.querySelectorAll("tr"));

    // Saved column layout. Wrapped because storage throws in a private
    // window, and a saved preference is never worth a broken page.
    function saved() {
      try { return JSON.parse(localStorage.getItem(STORE) || "{}"); }
      catch (e) { return {}; }
    }
    function save(v) {
      try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) {}
    }

    function applyCols() {
      var hidden = saved();
      headers.forEach(function (th, i) {
        var key = th.getAttribute("data-key");
        var off = hidden[key] === true;
        th.hidden = off;
        rows.forEach(function (tr) {
          var cell = tr.children[i];
          if (cell) cell.hidden = off;
        });
      });
    }

    function sortBy(key) {
      // Third click on the same column returns to the default order rather
      // than leaving no way back to it.
      if (sortKey === key) {
        if (sortDir === -1) sortDir = 1;
        else { sortKey = "published"; sortDir = -1; }
      } else {
        sortKey = key; sortDir = -1;
      }

      var idx = headers.findIndex(function (th) { return th.getAttribute("data-key") === sortKey; });
      rows.sort(function (a, b) {
        var av = a.children[idx].getAttribute("data-sort") || a.children[idx].textContent;
        var bv = b.children[idx].getAttribute("data-sort") || b.children[idx].textContent;
        return av === bv ? 0 : (av > bv ? sortDir : -sortDir);
      });
      rows.forEach(function (tr) { body.appendChild(tr); });

      headers.forEach(function (th) {
        var d = th.querySelector(".dir");
        if (d) d.textContent = th.getAttribute("data-key") === sortKey
          ? (sortDir === -1 ? "▼" : "▲") : "";
      });
    }

    headers.forEach(function (th) {
      th.addEventListener("click", function () { sortBy(th.getAttribute("data-key")); });
    });

    var colsBtn = document.getElementById("colsbtn");
    var colsMenu = document.getElementById("colsmenu");
    if (colsBtn && colsMenu) {
      colsMenu.innerHTML = headers.map(function (th) {
        var key = th.getAttribute("data-key");
        return '<label><input type="checkbox" data-col="' + esc(key) + '"> ' +
          esc(th.textContent.trim()) + "</label>";
      }).join("");

      var hidden = saved();
      colsMenu.querySelectorAll("input").forEach(function (box) {
        box.checked = hidden[box.getAttribute("data-col")] !== true;
        box.addEventListener("change", function () {
          var h = saved();
          h[box.getAttribute("data-col")] = !box.checked;
          save(h);
          applyCols();
        });
      });

      colsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        colsMenu.hidden = !colsMenu.hidden;
      });
      document.addEventListener("click", function (e) {
        if (!colsMenu.hidden && !colsMenu.contains(e.target)) colsMenu.hidden = true;
      });
    }

    applyCols();
    sortBy("published");
    sortDir = -1;
  }
})();
