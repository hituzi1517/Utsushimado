"use strict";

const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map(node => [node.id, node]));
const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const canCapture = () => Boolean(navigator.mediaDevices?.getDisplayMedia);
const visible = (element, show) => { element.hidden = !show; };
let role = "send";
let phase = "idle";
let session = null;

function status(message, error = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", error);
}

function render() {
  const sending = role === "send";
  const auto = ui.mode.value === "auto";
  const idle = phase === "idle";
  const ready = sending && phase === "approved";
  const canStart = sending && (idle || ready);
  ui["send-role"].setAttribute("aria-pressed", String(sending));
  ui["view-role"].setAttribute("aria-pressed", String(!sending));
  ui["send-role"].disabled = ui["view-role"].disabled = ui.mode.disabled = !idle;
  ui.start.textContent = ready ? "許可して画面を共有" : auto ? "招待コードを作る" : "画面を選んで招待コードを作る";
  ui.start.disabled = !canCapture() || !window.RTCPeerConnection || (auto && !window.Peer);
  visible(ui.start, canStart);
  visible(ui["audio-option"], sending && (ready || (idle && !auto)));
  visible(ui["join-form"], !sending && auto && idle);
  visible(ui.invite, sending && auto && phase === "invite");
  visible(ui["manual-in"], !auto && ((!sending && idle) || phase === "offer"));
  visible(ui["manual-out"], !auto && (phase === "offer" || (!sending && ["connecting", "live"].includes(phase))));
  visible(ui.stop, !idle);
  ui.stop.textContent = sending && session?.stream ? "画面共有を終了" : "接続を終了";
  if (!auto && !sending) {
    ui["incoming-label"].textContent = "送る側の招待コード";
    ui["outgoing-label"].textContent = "送る側に返す応答コード";
  }
  if (!auto && sending) {
    ui["incoming-label"].textContent = "見る側から届いた応答コード";
    ui["outgoing-label"].textContent = "見る側へ送る招待コード";
  }
}

function setPhase(next, message) {
  phase = next;
  status(message);
  render();
}

function showVideo(stream, local) {
  ui.video.srcObject = stream;
  ui.video.muted = true;
  ui.sound.textContent = "音を出す";
  ui["preview-state"].textContent = local ? "送信画面" : "受信中";
  ui.signal.classList.add("live");
  document.querySelector(".workspace").classList.add("has-video");
  visible(ui.video, true);
  visible(ui.placeholder, false);
  visible(ui.fullscreen, true);
  visible(ui.sound, !local && stream.getAudioTracks().length > 0);
  ui.video.play().catch(() => {
    if (ui.video.srcObject === stream) visible(ui.play, true);
  });
}

function clearVideo() {
  ui.video.pause();
  ui.video.srcObject = null;
  ui["preview-state"].textContent = "待機中";
  ui.size.textContent = "";
  ui.signal.classList.remove("live");
  document.querySelector(".workspace").classList.remove("has-video");
  [ui.video, ui.fullscreen, ui.sound, ui.play].forEach(element => visible(element, false));
  visible(ui.placeholder, true);
}

function end(message = "接続を終了しました。", error = false) {
  const previous = session;
  session = null;
  clearTimeout(previous?.timer);
  clearTimeout(previous?.disconnectTimer);
  previous?.stream?.getTracks().forEach(track => track.stop());
  previous?.media?.close();
  previous?.data?.close();
  previous?.peer?.destroy();
  if (previous?.control?.readyState === "open") previous.control.close();
  previous?.rtc?.close();
  ui.incoming.value = "";
  ui.outgoing.value = "";
  ui.qr.replaceChildren();
  clearVideo();
  phase = "idle";
  status(message, error);
  render();
}

function timeout(current, message, ms = 28000) {
  clearTimeout(current.timer);
  current.timer = setTimeout(() => {
    if (session === current) end(message, true);
  }, ms);
}

function live(current) {
  clearTimeout(current.timer);
  setPhase("live", role === "send" ? "画面を共有しています。" : "画面を受信しています。");
}

function explainIdle() {
  if (!window.isSecureContext || !window.RTCPeerConnection) {
    status("HTTPSで公開されたページを、対応ブラウザで開いてください。", true);
  } else if (role === "send" && !canCapture()) {
    status("このブラウザは画面の送信に対応していません。PCのChrome・Edgeか、Safari 27以降を使ってください。", true);
  } else if (ui.mode.value === "auto" && !window.Peer) {
    status("QR接続を読み込めませんでした。再読み込みするか、手動を使ってください。", true);
  } else if (role === "send") {
    status(ui.mode.value === "auto" ? "招待を作り、見る端末でQRコードを読みます。" : "画面を選ぶと、相手に送る招待コードができます。");
  } else {
    status(ui.mode.value === "auto" ? "QRから開くか、送る端末に表示されたコードを入力します。" : "送る端末から届いた招待コードを貼り付けます。");
  }
  render();
}

function joinCode(value) {
  const clean = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return clean.length === 16 && [...clean].every(char => inviteAlphabet.includes(char)) ? clean : "";
}

function makeInvite() {
  const random = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(random, value => inviteAlphabet[value & 31]).join("");
}

function inviteLink(code) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "view=" + code;
  return url.href;
}

function showInvite(code) {
  ui["invite-code"].textContent = code.match(/.{4}/g).join("-");
  if (window.qrcode) {
    const qr = window.qrcode(0, "M");
    qr.addData(inviteLink(code));
    qr.make();
    ui.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    ui.qr.querySelector("svg").setAttribute("aria-hidden", "true");
  }
  visible(ui.qr, Boolean(ui.qr.firstChild));
}

function attachConnection(rtc, current) {
  if (!rtc) return;
  const check = () => {
    if (session !== current) return;
    const state = rtc.connectionState;
    clearTimeout(current.disconnectTimer);
    if (state === "connected" && role === "send") live(current);
    if (state === "failed" || state === "closed") end("接続が切れました。両方を同じWi-Fiにつないでやり直してください。", true);
    if (state === "disconnected") {
      current.disconnectTimer = setTimeout(() => {
        if (session === current) end("接続が切れました。", true);
      }, 8000);
    }
  };
  rtc.addEventListener("connectionstatechange", check);
  check();
}

function newPeer(current, id, onOpen) {
  const options = { secure: true };
  const peer = current.peer = id ? new Peer(id, options) : new Peer(options);
  peer.on("open", () => {
    if (session === current) onOpen(peer);
  });
  peer.on("error", error => {
    if (session !== current) return;
    if (phase === "live" && peer.disconnected) return;
    const message = error.type === "peer-unavailable"
      ? "招待が見つかりません。送る側で新しいQRコードを作り直してください。"
      : "QR接続に失敗しました。同じWi-Fiで再試行するか、両方で手動を選んでください。";
    end(message, true);
  });
  peer.on("disconnected", () => {
    if (session === current && phase !== "live") end("接続サービスとの通信が切れました。再試行するか、手動を選んでください。", true);
  });
  return peer;
}

function watchData(data, current) {
  data.on("close", () => {
    if (session === current && current.data === data) end("相手の端末との接続が終了しました。");
  });
  data.on("error", () => {
    if (session === current && current.data === data) end("端末同士を接続できませんでした。同じWi-Fiで再試行してください。", true);
  });
}

function openInvite() {
  const current = session = { code: makeInvite() };
  setPhase("starting", "招待を作っています…");
  timeout(current, "接続サービスが応答しません。手動に切り替えて試せます。");
  const peer = newPeer(current, "utsushimado-" + current.code, () => {
    clearTimeout(current.timer);
    showInvite(current.code);
    setPhase("invite", "見る端末でQRコードを読むか、下のコードを入力してください。");
  });
  peer.on("connection", data => {
    if (session !== current || phase !== "invite" || data.metadata?.app !== "utsushimado-v1") {
      data.close();
      return;
    }
    watchData(data, current);
    data.on("open", () => {
      if (session !== current || phase !== "invite") {
        data.close();
        return;
      }
      current.data = data;
      data.send("waiting-for-approval");
      setPhase("approved", "見る端末が接続しました。自分の端末であることを確かめて、共有を開始してください。");
    });
  });
  peer.on("call", call => call.close());
}

function connectViewer(code) {
  const current = session = {};
  setPhase("starting", "送る端末に接続しています…");
  timeout(current, "送る端末に接続できません。同じWi-Fiと接続コードを確認してください。");
  const peer = newPeer(current, null, endpoint => {
    const data = current.data = endpoint.connect("utsushimado-" + code, {
      reliable: true,
      serialization: "json",
      metadata: { app: "utsushimado-v1" }
    });
    watchData(data, current);
    data.on("data", message => {
      if (session !== current || message !== "waiting-for-approval" || phase !== "starting") return;
      timeout(current, "送る側の共有が始まりませんでした。もう一度接続してください。", 120000);
      setPhase("connecting", "送る端末で画面共有を開始してください。");
    });
  });
  peer.on("call", call => {
    if (session !== current || current.media || !current.data?.open || call.peer !== current.data.peer) {
      call.close();
      return;
    }
    current.media = call;
    call.on("stream", stream => {
      if (session !== current) return;
      showVideo(stream, false);
      live(current);
    });
    call.on("close", () => {
      if (session === current) end("画面共有が終了しました。");
    });
    call.answer();
    attachConnection(call.peerConnection, current);
    timeout(current, "映像を受信できませんでした。同じWi-Fiで再試行してください。");
  });
}

async function capture(current) {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: ui.audio.checked });
    if (session !== current) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    current.stream = stream;
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      if (session === current) end("画面共有が終了しました。");
    });
    showVideo(stream, true);
    return stream;
  } catch (error) {
    if (session !== current) return null;
    const message = error.name === "NotAllowedError"
      ? "画面共有が許可されませんでした。もう一度試せます。"
      : "画面を取得できませんでした。ブラウザとOSの画面共有設定を確認してください。";
    if (current.data?.open) {
      setPhase("approved", message);
      ui.status.classList.add("error");
    } else {
      end(message, true);
    }
    return null;
  }
}

async function sendAutomatically(current) {
  setPhase("starting", "共有する画面を選んでください。");
  const stream = await capture(current);
  if (!stream || session !== current) return;
  try {
    const call = current.media = current.peer.call(current.data.peer, stream);
    if (!call) throw new Error("Media connection unavailable");
    call.on("close", () => {
      if (session === current) end("見る端末との接続が終了しました。");
    });
    setPhase("connecting", "映像をつないでいます…");
    timeout(current, "映像を送信できませんでした。同じWi-Fiで再試行してください。");
    attachConnection(call.peerConnection, current);
  } catch {
    end("画面共有を開始できませんでした。もう一度接続してください。", true);
  }
}

function encodeDescription(description) {
  const data = new TextEncoder().encode(JSON.stringify({ type: description.type, sdp: description.sdp }));
  return "UM1." + btoa(Array.from(data, value => String.fromCharCode(value)).join(""));
}

function decodeDescription(value, expected) {
  const clean = value.trim().replace(/\s/g, "");
  if (!/^UM1\.[A-Za-z0-9+/=]+$/.test(clean) || clean.length > 100000) throw new Error("Invalid code");
  const data = Uint8Array.from(atob(clean.slice(4)), char => char.charCodeAt(0));
  const parsed = JSON.parse(new TextDecoder().decode(data));
  if (parsed.type !== expected || typeof parsed.sdp !== "string" || !parsed.sdp.startsWith("v=0")) {
    throw new Error("Wrong description type");
  }
  return { type: parsed.type, sdp: parsed.sdp };
}

function watchManualChannel(channel, current) {
  current.control = channel;
  channel.addEventListener("close", () => {
    if (session === current) end("相手の端末との接続が終了しました。");
  });
}

function gather(rtc) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (rtc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      rtc.removeEventListener("icegatheringstatechange", finish);
      resolve(rtc.localDescription);
    };
    const timer = setTimeout(() => {
      rtc.removeEventListener("icegatheringstatechange", finish);
      if (rtc.localDescription && /\na=candidate:/.test(rtc.localDescription.sdp)) resolve(rtc.localDescription);
      else reject(new Error("ICE gathering timed out"));
    }, 7000);
    rtc.addEventListener("icegatheringstatechange", finish);
    finish();
  });
}

async function manualOffer() {
  const current = session = {};
  setPhase("starting", "共有する画面を選んでください。");
  const stream = await capture(current);
  if (!stream || session !== current) return;
  try {
    const rtc = current.rtc = new RTCPeerConnection({ iceServers: [] });
    stream.getTracks().forEach(track => rtc.addTrack(track, stream));
    watchManualChannel(rtc.createDataChannel("utsushimado"), current);
    await rtc.setLocalDescription(await rtc.createOffer());
    const description = await gather(rtc);
    if (session !== current) return;
    ui.outgoing.value = encodeDescription(description);
    setPhase("offer", "招待コードを相手に送り、返ってきた応答コードを貼り付けます。");
  } catch {
    if (session === current) end("手動接続の招待を作れませんでした。同じWi-Fiを確認するか、QR接続を試してください。", true);
  }
}

async function applyManualCode() {
  const sending = role === "send";
  let description;
  try {
    description = decodeDescription(ui.incoming.value, sending ? "answer" : "offer");
  } catch {
    status(sending ? "見る側が作った応答コードを全文貼り付けてください。" : "送る側が作った招待コードを全文貼り付けてください。", true);
    return;
  }
  if (sending) {
    const current = session;
    setPhase("connecting", "映像をつないでいます…");
    try {
      await current.rtc.setRemoteDescription(description);
      if (session !== current) return;
      timeout(current, "端末同士が見つかりません。同じWi-Fiで最初から接続してください。");
      attachConnection(current.rtc, current);
    } catch {
      if (session === current) {
        setPhase("offer", "この招待に対する応答コードを貼り付け直してください。");
        ui.status.classList.add("error");
      }
    }
    return;
  }
  const current = session = {};
  setPhase("starting", "応答コードを作っています…");
  try {
    const rtc = current.rtc = new RTCPeerConnection({ iceServers: [] });
    attachConnection(rtc, current);
    rtc.addEventListener("datachannel", event => watchManualChannel(event.channel, current));
    rtc.addEventListener("track", event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      const display = () => {
        if (session !== current || rtc.connectionState !== "connected") return;
        if (ui.video.srcObject !== stream) showVideo(stream, false);
        live(current);
      };
      rtc.addEventListener("connectionstatechange", display);
      event.track.addEventListener("unmute", display);
      display();
    });
    await rtc.setRemoteDescription(description);
    await rtc.setLocalDescription(await rtc.createAnswer());
    const answer = await gather(rtc);
    if (session !== current) return;
    ui.outgoing.value = encodeDescription(answer);
    setPhase("connecting", "応答コードを送る側に返し、読み込んでもらってください。");
  } catch {
    if (session === current) end("手動接続の応答を作れませんでした。同じWi-Fiを確認するか、QR接続を試してください。", true);
  }
}

async function copy(value, button, fallback) {
  const original = fallback ? "コードをコピー" : "招待リンクをコピー";
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "コピーしました";
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => { button.textContent = original; }, 1200);
  } catch {
    if (fallback) {
      fallback.focus();
      fallback.select();
      status("選択したコードを端末のコピー操作でコピーしてください。");
    } else {
      status("リンクをコピーできませんでした。QRコードか接続コードを使ってください。", true);
    }
  }
}

function chooseRole(next) {
  role = next;
  explainIdle();
}

ui["send-role"].addEventListener("click", () => chooseRole("send"));
ui["view-role"].addEventListener("click", () => chooseRole("view"));
ui.mode.addEventListener("change", explainIdle);
ui.start.addEventListener("click", () => {
  if (ui.mode.value === "manual") manualOffer();
  else if (phase === "approved") sendAutomatically(session);
  else openInvite();
});
ui.stop.addEventListener("click", () => end());
ui["join-form"].addEventListener("submit", event => {
  event.preventDefault();
  const code = joinCode(ui.join.value);
  if (!code) status("送る端末に表示された16文字の接続コードを確認してください。", true);
  else if (!window.Peer) status("QR接続を利用できません。手動に切り替えてください。", true);
  else connectViewer(code);
});
ui["copy-link"].addEventListener("click", () => copy(inviteLink(session.code), ui["copy-link"]));
ui["copy-code"].addEventListener("click", () => copy(ui.outgoing.value, ui["copy-code"], ui.outgoing));
ui["apply-code"].addEventListener("click", applyManualCode);
ui.play.addEventListener("click", () => ui.video.play().catch(() => status("映像を再生できませんでした。もう一度お試しください。", true)));
ui.video.addEventListener("playing", () => visible(ui.play, false));
ui.video.addEventListener("resize", () => {
  if (ui.video.srcObject && ui.video.videoWidth) ui.size.textContent = ui.video.videoWidth + " × " + ui.video.videoHeight;
});
ui.sound.addEventListener("click", () => {
  ui.video.muted = !ui.video.muted;
  ui.sound.textContent = ui.video.muted ? "音を出す" : "消音";
  ui.video.play().catch(() => visible(ui.play, true));
});
ui.fullscreen.addEventListener("click", async () => {
  try {
    if (ui.screen.requestFullscreen) await ui.screen.requestFullscreen();
    else if (ui.video.webkitEnterFullscreen) ui.video.webkitEnterFullscreen();
    else throw new Error("Fullscreen unavailable");
  } catch {
    if (ui.video.webkitEnterFullscreen && ui.video.readyState >= 2) {
      try {
        ui.video.webkitEnterFullscreen();
        return;
      } catch { /* The browser may reject native video fullscreen as well. */ }
    }
    status("このブラウザでは全画面表示を開始できませんでした。", true);
  }
});

const codeFromLink = joinCode(new URLSearchParams(location.hash.slice(1)).get("view") || "");
if (codeFromLink) {
  history.replaceState(null, "", location.pathname + location.search);
  ui.join.value = codeFromLink.match(/.{4}/g).join("-");
  chooseRole("view");
  if (window.Peer && window.RTCPeerConnection) connectViewer(codeFromLink);
} else {
  explainIdle();
}
