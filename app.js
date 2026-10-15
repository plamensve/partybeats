/* PartyBeats v1 — client-only prototype.
   The storage layer is intentionally isolated so Supabase/auth can replace it later. */
(function () {
  "use strict";

  const STORAGE_KEY = "partybeats_demo_v1";
  const DEFAULT_SONGS = [
    { id:"yXQViqx6GMY", youtubeId:"yXQViqx6GMY", title:"All I Want for Christmas Is You", artist:"Mariah Carey", category:"christmas", author:"Екип PartyBeats", addedAt:"2026-10-11T10:00:00Z", likes:27, dislikes:3 },
    { id:"E8gmARGvPlI", youtubeId:"E8gmARGvPlI", title:"Last Christmas", artist:"Wham!", category:"christmas", author:"Екип PartyBeats", addedAt:"2026-10-12T10:00:00Z", likes:23, dislikes:4 },
    { id:"5NV6Rdv1a3I", youtubeId:"5NV6Rdv1a3I", title:"Get Lucky", artist:"Daft Punk ft. Pharrell Williams", category:"party", author:"Екип PartyBeats", addedAt:"2026-10-12T12:00:00Z", likes:22, dislikes:4 },
    { id:"4NRXx6U8ABQ", youtubeId:"4NRXx6U8ABQ", title:"Blinding Lights", artist:"The Weeknd", category:"party", author:"Екип PartyBeats", addedAt:"2026-10-13T08:00:00Z", likes:20, dislikes:3 },
    { id:"xFrGuyw1V8s", youtubeId:"xFrGuyw1V8s", title:"Dancing Queen", artist:"ABBA", category:"party", author:"Екип PartyBeats", addedAt:"2026-10-13T10:00:00Z", likes:16, dislikes:2 },
    { id:"1qYz7rfgLWE", youtubeId:"1qYz7rfgLWE", title:"Rockin' Around the Christmas Tree", artist:"Brenda Lee", category:"christmas", author:"Екип PartyBeats", addedAt:"2026-10-14T08:00:00Z", likes:14, dislikes:2 },
    { id:"TUVcZfQe-Kw", youtubeId:"TUVcZfQe-Kw", title:"Levitating", artist:"Dua Lipa", category:"party", author:"Екип PartyBeats", addedAt:"2026-10-14T12:00:00Z", likes:12, dislikes:2 }
  ];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const state = { addedSongs:[], votes:{}, displayName:"", filter:"all", sort:"popular", search:"" };
  let activeSong = null;
  let toastTimeout = null;
  let modalTrigger = null;

  function parseYouTubeId(raw) {
    try {
      const url = new URL(String(raw).trim());
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      let id = null;
      if (host === "youtu.be") id = url.pathname.split("/")[1];
      else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
        const segments = url.pathname.split("/").filter(Boolean);
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else if (["shorts", "embed", "live", "v"].includes(segments[0])) id = segments[1];
      }
      return /^[a-zA-Z0-9_-]{11}$/.test(id || "") ? id : null;
    } catch (_) { return null; }
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (Array.isArray(stored.addedSongs)) {
        state.addedSongs = stored.addedSongs.filter((s) => s && typeof s.youtubeId === "string" && /^[\w-]{11}$/.test(s.youtubeId) && typeof s.title === "string" && typeof s.id === "string").slice(0, 500);
      }
      if (stored.votes && typeof stored.votes === "object" && !Array.isArray(stored.votes)) {
        Object.keys(stored.votes).forEach((id) => { if ([1, -1].includes(stored.votes[id])) state.votes[id] = stored.votes[id]; });
      }
      if (typeof stored.displayName === "string") state.displayName = stored.displayName.slice(0, 35);
    } catch (_) { /* Browser storage may be disabled. The demo still works in memory. */ }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ addedSongs:state.addedSongs, votes:state.votes, displayName:state.displayName }));
    } catch (_) { toast("Браузърът не позволява локално запазване."); }
  }

  function songs() { return DEFAULT_SONGS.concat(state.addedSongs); }
  function voteData(song) {
    const vote = state.votes[song.id] || 0;
    const up = (Number(song.likes) || 0) + (vote === 1 ? 1 : 0);
    const down = (Number(song.dislikes) || 0) + (vote === -1 ? 1 : 0);
    return { up, down, score:up - down, vote };
  }
  function sortedSongs() {
    const items = songs().filter((s) => {
      if (state.filter === "voted" && !state.votes[s.id]) return false;
      if (state.filter !== "all" && state.filter !== "voted" && s.category !== state.filter) return false;
      const text = (s.title + " " + s.artist + " " + s.author).toLocaleLowerCase("bg-BG");
      return text.includes(state.search);
    });
    items.sort((a,b) => {
      if (state.sort === "az") return a.title.localeCompare(b.title, "bg-BG");
      if (state.sort === "recent") return new Date(b.addedAt) - new Date(a.addedAt);
      return voteData(b).score - voteData(a).score || new Date(b.addedAt) - new Date(a.addedAt);
    });
    return items;
  }
  function el(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function svg(id) {
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svgEl.setAttribute("class", "icon");
    const use = document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href", "#i-" + id);
    svgEl.appendChild(use);
    return svgEl;
  }
  function genreLabel(song) { return song.category === "christmas" ? "🎄 Коледна" : "⚡ Парти хит"; }
  function thumb(song) { return "https://i.ytimg.com/vi/" + song.youtubeId + "/hqdefault.jpg"; }

  function renderSong(song, position) {
    const row = el("article","song-row");
    row.dataset.songId = song.id;
    const rank = el("span","song-rank" + (position < 3 ? " top-rank" : ""), String(position + 1).padStart(2,"0"));
    const cover = el("button","song-cover");
    cover.type = "button";
    cover.setAttribute("aria-label", "Пусни " + song.title);
    const img = el("img");
    img.src = thumb(song);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 120;
    img.height = 90;
    const coverPlay = el("span","cover-play");
    coverPlay.appendChild(svg("play"));
    cover.append(img, coverPlay);
    cover.addEventListener("click", () => playSong(song));
    const info = el("div","song-info");
    info.appendChild(el("h3","",song.title));
    info.appendChild(el("p","song-artist",song.artist || "Неизвестен изпълнител"));
    const meta = el("div","song-meta");
    meta.append(el("span","song-genre",genreLabel(song)), el("span","song-meta-dot"), el("span","", "от " + (song.author || "Анонимен")));
    info.appendChild(meta);
    const voting = el("div","vote-group");
    const data = voteData(song);
    const up = el("button","vote-button" + (data.vote === 1 ? " is-liked" : ""));
    up.type = "button";
    up.dataset.voteDirection = "up";
    up.setAttribute("aria-label","Харесвам " + song.title);
    up.setAttribute("aria-pressed", String(data.vote === 1));
    up.append(svg("thumbs-up"), el("span","",String(data.up)));
    up.addEventListener("click", () => vote(song.id,1));
    const down = el("button","vote-button dislike" + (data.vote === -1 ? " is-disliked" : ""));
    down.type = "button";
    down.dataset.voteDirection = "down";
    down.setAttribute("aria-label","Не харесвам " + song.title);
    down.setAttribute("aria-pressed", String(data.vote === -1));
    down.append(svg("thumbs-down"), el("span","",String(data.down)));
    down.addEventListener("click", () => vote(song.id,-1));
    const score = el("span","score-box" + (data.score < 0 ? " negative" : data.score === 0 ? " neutral" : ""), (data.score > 0 ? "+" : "") + data.score);
    score.title = "Резултат = харесвания − нехаресвания";
    voting.append(up, down, score);
    row.append(rank, cover, info, voting);
    return row;
  }
  function render() {
    const all = songs();
    const ranked = sortedSongs();
    const list = $("#song-list");
    const fragment = document.createDocumentFragment();
    if (!ranked.length) {
      const blank = el("div","empty-state");
      blank.append(el("span","empty-emoji","🎶"),el("h3","", "Тук е тихичко..."),el("p","", "Няма песни, които да отговарят на избрания филтър."));
      const add = el("button","button button-primary","Добави песен");
      add.type = "button";
      add.addEventListener("click",openAdd);
      blank.appendChild(add);
      fragment.appendChild(blank);
    } else ranked.forEach((song,index) => fragment.appendChild(renderSong(song,index)));
    list.replaceChildren(fragment);
    $("#song-results-status").textContent = `${ranked.length} песни от общо ${all.length}.`;
    $("#all-count").textContent = String(all.length);
    $("#stat-songs").textContent = String(all.length).padStart(2,"0");
    $("#stat-votes").textContent = String(all.reduce((sum,song) => { const v = voteData(song); return sum + v.up + v.down; },0));
    $("#stat-participants").textContent = String(new Set(all.map((s) => s.author || "Анонимен")).size).padStart(2,"0");
    $$(".filter-tab").forEach((button) => {
      const selected = button.dataset.filter === state.filter;
      button.classList.toggle("is-active",selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const top = all.slice().sort((a,b) => voteData(b).score - voteData(a).score)[0];
    if (top) {
      activeSong = top;
      $("#featured-image").src = thumb(top);
      $("#featured-image").alt = "Обложка на " + top.title;
      $("#featured-title").textContent = top.title;
      $("#featured-artist").textContent = top.artist;
      $("#featured-score").textContent = String(voteData(top).score);
    }
  }
  function vote(id,value) {
    const keyboardFocus = document.activeElement && document.activeElement.matches(":focus-visible");
    state.votes[id] = state.votes[id] === value ? 0 : value;
    if (!state.votes[id]) delete state.votes[id];
    saveState();
    render();
    if (keyboardFocus) {
      const row = Array.from(document.querySelectorAll(".song-row")).find(element => element.dataset.songId === id);
      const direction = value === 1 ? "up" : "down";
      const control = row && row.querySelector('[data-vote-direction="' + direction + '"]');
      if (control) control.focus({preventScroll:true});
    }
    toast(value === 1 ? "Гласът ти е отчетен в този браузър! 👍" : "Гласът ти е отчетен в този браузър! 👎");
  }
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.classList.remove("is-visible"),3200);
  }
  function openModal(id) {
    const modal = $("#" + id);
    if (!modal) return;
    modalTrigger = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    if (window.PartyBeatsPlayer) window.PartyBeatsPlayer.pauseForModal();
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    const focusTarget = modal.querySelector("input,button");
    if (focusTarget) focusTarget.focus({preventScroll:true});
  }
  function closeModal(modal) {
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden","true");

    if (!document.querySelector(".modal.is-open")) {
      document.body.style.overflow = "";
      document.body.classList.remove("modal-open");
      if (modalTrigger && modalTrigger.isConnected) modalTrigger.focus({preventScroll:true});
      modalTrigger = null;
    }
  }
  function openAdd() {
    $("#add-form").reset();
    $("#song-author").value = state.displayName;
    $("#form-error").hidden = true;
    $("#video-preview").hidden = true;
    openModal("add-modal");
    // Touch users can open the keyboard when ready.
    if (!window.matchMedia("(max-width:767px) and (pointer:coarse)").matches) $("#youtube-url").focus({preventScroll:true});
  }
  function playSong(song) {
    if (window.PartyBeatsPlayer) {
      const queue = sortedSongs();
      // Featured songs may not belong to the active filter.
      if (!queue.some((item) => item.id === song.id)) queue.unshift(song);
      window.PartyBeatsPlayer.play(song, queue);
    }
  }
  function handleAdd(event) {
    event.preventDefault();
    const id = parseYouTubeId($("#youtube-url").value);
    const title = $("#song-title").value.trim();
    const artist = $("#song-artist").value.trim();
    const author = $("#song-author").value.trim() || "Анонимен";
    const error = $("#form-error");
    error.hidden = true;
    if (!id) { error.textContent = "Въведи валиден YouTube адрес."; error.hidden = false; return; }
    if (!title) { error.textContent = "Добави заглавие на песента."; error.hidden = false; return; }
    if (songs().some((s) => s.youtubeId === id)) { error.textContent = "Тази песен вече присъства в плейлиста."; error.hidden = false; return; }
    state.addedSongs.unshift({ id:"local-" + id, youtubeId:id, title:title.slice(0,100), artist:artist.slice(0,70), author:author.slice(0,35), category:$("#song-category").value === "christmas" ? "christmas" : "party", addedAt:new Date().toISOString(), likes:0, dislikes:0 });
    state.displayName = author === "Анонимен" ? "" : author;
    state.filter = "all";
    state.search = "";
    $("#song-search").value = "";
    saveState();
    closeModal($("#add-modal"));
    render();
    toast("Песента е добавена в твоето локално демо! 🎵");
    $("#playlist").scrollIntoView({behavior:"smooth"});
  }
  function previewUrl() {
    const id = parseYouTubeId($("#youtube-url").value);
    $("#video-preview").hidden = !id;
    if (id) $("#preview-image").src = "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg";
  }
  function exportCsv() {
    const all = songs().slice().sort((a,b) => voteData(b).score - voteData(a).score);
    function cell(value) {
      let str = String(value === undefined || value === null ? "" : value);
      if (/^[=+\-@]/.test(str)) str = "'" + str;
      return '"' + str.replace(/"/g,'""') + '"';
    }
    const rows = [["Позиция","Заглавие","Изпълнител","Категория","Точки","YouTube URL"]].concat(all.map((s,i) => [i+1,s.title,s.artist,genreLabel(s),voteData(s).score,"https://www.youtube.com/watch?v=" + s.youtubeId]));
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "partybeats-playlist.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    toast("Експортът е готов! 🎶");
  }
  async function share() {
    const url = window.location.href.split("#")[0];
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({title:"PartyBeats",text:"Предложи песен и гласувай за парти плейлиста!",url});
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Линкът към сайта е копиран!");
    } catch (_) {
      window.prompt("Копирай линка към сайта:",url);
    }
  }
  function resetDemo() {
    if (!window.confirm("Сигурен ли си? Това ще изтрие твоите добавени песни и гласове от този браузър.")) return;
    if (window.PartyBeatsPlayer) window.PartyBeatsPlayer.close();
    state.addedSongs = [];
    state.votes = {};
    state.displayName = "";
    state.filter = "all";
    state.sort = "popular";
    state.search = "";
    $("#song-search").value = "";
    $("#song-sort").value = "popular";
    saveState();
    render();
    toast("Демото е нулирано.");
  }
  function syncMobileNavigation() {
    const section = $("#playlist");
    if (!section) return;
    const atPlaylist = section.getBoundingClientRect().top <= 128;
    $$(".mobile-nav-link").forEach(link => {
      const active = link.dataset.nav === (atPlaylist ? "playlist" : "home");
      link.classList.toggle("mobile-nav-link-active",active);
      if (active) link.setAttribute("aria-current","page");
      else link.removeAttribute("aria-current");
    });
  }
  function init() {
    loadState();
    $$("[data-open-add]").forEach((button) => button.addEventListener("click", openAdd));
    $("#login-button").addEventListener("click", () => openModal("login-modal"));
    $("#featured-play").addEventListener("click", () => { if (activeSong) playSong(activeSong); });
    $("#add-form").addEventListener("submit", handleAdd);
    $("#youtube-url").addEventListener("input",previewUrl);
    let searchTimer = null;
    $("#song-search").addEventListener("input",(e) => {
      state.search = e.target.value.toLocaleLowerCase("bg-BG").trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render,100);
    });
    $("#song-sort").addEventListener("change",(e) => { state.sort = e.target.value; render(); });
    $$(".filter-tab").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; render(); }));
    $("#share-button").addEventListener("click",share);
    $("#export-button").addEventListener("click",exportCsv);
    $("#reset-button").addEventListener("click",resetDemo);
    let scrollPending = false;
    window.addEventListener("scroll",() => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => { scrollPending = false; syncMobileNavigation(); });
    },{passive:true});
    window.addEventListener("resize",syncMobileNavigation,{passive:true});
    $$(".mobile-nav-link").forEach(link =>
      link.addEventListener("click",() => requestAnimationFrame(syncMobileNavigation))
    );
    $$(".modal").forEach((modal) => modal.addEventListener("click",(event) => { if (event.target === modal || event.target.closest("[data-close]")) closeModal(modal); }));
    document.addEventListener("keydown",(event) => {
      const modal = $(".modal.is-open");
      if (!modal) return;
      if (event.key === "Escape") {
        closeModal(modal);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((element) => element.getClientRects().length && !element.closest("[hidden]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    render();
    syncMobileNavigation();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();