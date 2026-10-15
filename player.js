/* PartyBeats player — UI inspired by music services, playback via the official
   YouTube IFrame Player API. The YouTube video remains visible while playing.
   The decorative waveform is not an audio analysis or an audio stream. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const root = $("music-player");
  const pane = $("pb-expanded");
  const progress = $("pb-progress");
  const iconUse = $("pb-play-icon").querySelector("use");
  const expandUse = $("pb-expand-icon").querySelector("use");
  const status = $("pb-player-status");
  const state = {
    song:null, queue:[], index:0, player:null, ready:false,
    expanded:true, playing:false, loading:false, startNext:false, lastId:null
  };
  let ticker=null, apiPromise=null;
  const validId = (id) => typeof id === "string" && /^[\w-]{11}$/.test(id);
  const youtubeUrl = (id) => "https://www.youtube.com/watch?v=" + id;
  const imageUrl = (id) => "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
  function formatTime(n) {
    if (!Number.isFinite(n) || n < 0) return "0:00";
    n=Math.floor(n);
    const hours=Math.floor(n/3600), minutes=Math.floor((n%3600)/60), seconds=n%60;
    return hours ? hours+":"+String(minutes).padStart(2,"0")+":"+String(seconds).padStart(2,"0")
      : minutes+":"+String(seconds).padStart(2,"0");
  }
  function playerCall(method,...args) {
    try {
      if (state.player && typeof state.player[method] === "function") {
        return state.player[method](...args);
      }
    } catch (_) { /* the iframe may be transitioning/destroyed */ }
    return null;
  }
  function report(message) { status.textContent=message || ""; }
  function renderPlayState() {
    iconUse.setAttribute("href",state.playing ? "#i-pause" : "#i-play");
    $("pb-play").setAttribute("aria-label",state.playing ? "Пауза" : "Пусни");
    $("pb-play").setAttribute("title",state.playing ? "Пауза" : "Пусни");
    root.classList.toggle("is-playing",state.playing);
    $("pb-prev").disabled=state.index<=0;
    $("pb-next").disabled=state.index>=state.queue.length-1;
  }
  function renderTrack() {
    const song=state.song;
    if (!song) return;
    $("pb-track-title").textContent=song.title || "Без заглавие";
    $("pb-expanded-title").textContent=song.title || "Без заглавие";
    $("pb-track-artist").textContent=song.artist || "Неизвестен изпълнител";
    $("pb-expanded-artist").textContent=song.artist || "Неизвестен изпълнител";
    $("pb-artwork").src=imageUrl(song.youtubeId);
    $("pb-artwork").alt="Обложка: "+(song.title || "песен");
    $("pb-youtube-link").href=youtubeUrl(song.youtubeId);
    progress.value="0";
    progress.style.setProperty("--percent","0%");
    progress.disabled=true;
    $("pb-current").textContent="0:00";
    $("pb-duration").textContent="0:00";
    progress.setAttribute("aria-valuetext","0:00");
    renderPlayState();
  }
  function setExpanded(expanded) {
    // Collapsing an active YouTube player is not a background-audio mode.
    if (!expanded) {
      playerCall("pauseVideo");
      state.playing=false;
      report("На пауза. Разгъни плейъра, за да продължиш.");
    }
    state.expanded=expanded;
    pane.hidden=!expanded;
    $("pb-expand").setAttribute("aria-expanded",String(expanded));
    $("pb-expand").setAttribute("aria-label", expanded ? "Свий плейъра" : "Разгъни плейъра");
    expandUse.setAttribute("href", expanded ? "#i-chevron-down" : "#i-chevron-up");
    root.classList.toggle("is-collapsed",!expanded);
    renderPlayState();
  }
  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise=new Promise((resolve,reject) => {
      let done=false;
      const timeout=setTimeout(() => {
        if (!done){done=true; reject(new Error("YouTube API timeout"));}
      },15000);
      const previous=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=function() {
        if(typeof previous==="function")previous();
        if (!done) {done=true;clearTimeout(timeout);resolve();}
      };
      const script=document.createElement("script");
      script.src="https://www.youtube.com/iframe_api";
      script.async=true;
      script.onerror=() => {if(!done){done=true;clearTimeout(timeout);reject(new Error("YouTube API unavailable"));}};
      document.head.appendChild(script);
    }).catch(error=>{apiPromise=null;throw error;});
    return apiPromise;
  }
  function ensurePlayer() {
    if (state.player) return Promise.resolve();
    state.loading=true;
    report("Зареждане на YouTube плейъра…");
    return loadApi().then(() => {
      if (state.player || !state.song || root.hidden) return;
      return new Promise((resolve) => {
        state.player=new window.YT.Player("pb-youtube-host",{
          width:"100%",height:"100%",
          videoId:state.song.youtubeId,
          playerVars:{playsinline:1,controls:1,rel:0,enablejsapi:1},
          events:{
            onReady:() => {
              state.ready=true;state.loading=false;
              const current=state.song;
              if (current && !root.hidden) playerCall("loadVideoById",current.youtubeId);
              state.lastId=current ? current.youtubeId : null;
              report("Управлявай музиката тук или директно във видеото.");
              beginTicker();
              resolve();
            },
            onStateChange:(event) => {
              const YT=window.YT && window.YT.PlayerState;
              if(!YT)return;
              state.playing=event.data===YT.PLAYING;
              state.loading=event.data===YT.BUFFERING;
              renderPlayState();
              updateTime();
              if(event.data===YT.PLAYING)report("");
              if(event.data===YT.ENDED){
                if (state.expanded && document.visibilityState==="visible" && state.index<state.queue.length-1) {
                  selectIndex(state.index+1,true);
                } else {
                  report("Песента приключи. Избери следваща или пусни отново.");
                }
              }
            },
            onAutoplayBlocked:() => {
              state.playing=false;renderPlayState();
              report("Браузърът блокира автоматичното пускане. Натисни Play във видимия YouTube плейър.");
            },
            onError:(event) => {
              state.playing=false;renderPlayState();
              report("Това видео не може да се възпроизведе тук ("+String(event.data)+"). Използвай линка към YouTube.");
            }
          }
        });
      });
    }).catch(() => {
      state.loading=false;
      report("Плейърът не се зареди. Отвори видеото директно в YouTube.");
    });
  }
  function beginTicker() {
    if(ticker)return;
    ticker=setInterval(() => {
      if (!state.song || !state.ready || document.visibilityState==="hidden") return;
      updateTime();
    },450);
  }
  function updateTime() {
    if(!state.ready || !state.song)return;
    const duration=Number(playerCall("getDuration"))||0;
    const current=Math.max(0,Number(playerCall("getCurrentTime"))||0);
    if (document.activeElement!==progress) {
      progress.value=duration>0?String(Math.min(100,current/duration*100)):"0";
      progress.style.setProperty("--percent",progress.value+"%");
    }
    progress.disabled=duration<=0 || !state.expanded;
    $("pb-current").textContent=formatTime(current);
    $("pb-duration").textContent=formatTime(duration);
    progress.setAttribute("aria-valuetext",formatTime(current)+" от "+formatTime(duration));
  }
  function selectIndex(index,autoPlay) {
    if(index<0 || index>=state.queue.length) return;
    state.index=index;state.song=state.queue[index];
    state.playing=false;
    state.lastId=state.song.youtubeId;
    renderTrack();
    setExpanded(true);
    report("Зареждане на песента…");
    if(state.ready) {
      if(autoPlay)playerCall("loadVideoById",state.song.youtubeId);
      else playerCall("cueVideoById",state.song.youtubeId);
    } else {
      ensurePlayer();
    }
  }
  function play(song,queue) {
    if (!song || !validId(song.youtubeId)) return;
    if(state.song && state.song.id===song.id && !root.hidden) {
      setExpanded(true);
      if(state.ready)playerCall("playVideo");
      else ensurePlayer();
      return;
    }
    state.queue=(Array.isArray(queue)?queue:[])
      .filter((s)=>s && validId(s.youtubeId));
    if(!state.queue.some((s)=>s.id===song.id))state.queue.unshift(song);
    const index=state.queue.findIndex((s)=>s.id===song.id);
    state.song=state.queue[index];
    state.index=index;
    state.playing=false;
    root.hidden=false;
    renderTrack();
    setExpanded(true);
    report("Зареждане на YouTube плейъра…");
    if(state.ready) {
      state.lastId=song.youtubeId;
      playerCall("loadVideoById",song.youtubeId);
    } else {
      ensurePlayer();
    }
  }
  function togglePlay() {
    if(!state.song)return;
    if(!state.expanded) {
      setExpanded(true);
      // An explicit press is still required on platforms that block autoplay.
      if(state.ready)playerCall("playVideo");
      else ensurePlayer();
      return;
    }
    if(state.playing) playerCall("pauseVideo");
    else if(state.ready) playerCall("playVideo");
    else ensurePlayer();
  }
  function seek() {
    if(!state.ready || !state.expanded)return;
    const duration=Number(playerCall("getDuration"))||0;
    if(duration>0)playerCall("seekTo",(Number(progress.value)/100)*duration,true);
    progress.blur();
  }
  function pauseForModal() {
    if(state.song && !root.hidden) {
      playerCall("pauseVideo");
      state.playing=false;
      renderPlayState();
      report("Възпроизвеждането е паузирано.");
    }
  }
  function close() {
    if(root.hidden)return;
    playerCall("stopVideo");
    if(state.player && typeof state.player.destroy==="function"){
      try{state.player.destroy();}catch(_){}
    }
    state.player=null;state.ready=false;state.song=null;
    state.queue=[];state.index=0;state.playing=false;
    state.loading=false;state.lastId=null;
    if(ticker){clearInterval(ticker);ticker=null;}
    const container=document.querySelector(".pb-yt-container");
    if(container) {
      const newHost=document.createElement("div");
      newHost.id="pb-youtube-host";
      container.replaceChildren(newHost);
    }
    root.hidden=true;
    pane.hidden=false;
    renderPlayState();
  }
  // Decorative SoundCloud-inspired waveform. Not derived from video/audio samples.
  (function fillWaveform() {
    const parent=$("pb-waveform");
    const seed=[9,18,12,25,34,17,29,43,24,38,15,31,44,20,36,27,16,42,29,24,39,13,31,43,20,33,12,27,45,17,35,23,41,19,29,16,34,25,38,14,27,40,23,16,35,26,31,12];
    for(const value of seed){
      const bar=document.createElement("span");
      bar.style.height=value+"px";
      parent.appendChild(bar);
    }
  })();
  $("pb-play").addEventListener("click",togglePlay);
  $("pb-prev").addEventListener("click",()=>selectIndex(state.index-1,true));
  $("pb-next").addEventListener("click",()=>selectIndex(state.index+1,true));
  $("pb-artwork-toggle").addEventListener("click",()=>setExpanded(!state.expanded));
  $("pb-expand").addEventListener("click",()=>setExpanded(!state.expanded));
  $("pb-collapse").addEventListener("click",()=>setExpanded(false));
  $("pb-close").addEventListener("click",close);
  $("pb-close-mobile").addEventListener("click",close);
  progress.addEventListener("change",seek);
  progress.addEventListener("input",()=>{
    progress.style.setProperty("--percent",progress.value+"%");
    const duration=Number(playerCall("getDuration"))||0;
    progress.setAttribute("aria-valuetext",formatTime(Number(progress.value)/100*duration)+" от "+formatTime(duration));
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden" && state.playing) pauseForModal();
  });
  window.PartyBeatsPlayer={play,pauseForModal,close};
})();