import{c as B,g as P,s as T}from"./index2.js";const c=B();function i(e){return document.getElementById(e)}function g(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}const a={stageArt:i("stageArt"),googleFallback:i("googleFallback"),stepCredentials:i("stepCredentials"),stepCampaign:i("stepCampaign"),googleButton:i("googleButton"),googleDivider:i("googleDivider"),formSwap:i("formSwap"),loginForm:i("loginForm"),registerForm:i("registerForm"),loginUsername:i("loginUsername"),loginPassword:i("loginPassword"),loginRemember:i("loginRemember"),forgotPasswordLink:i("forgotPasswordLink"),resetRequestForm:i("resetRequestForm"),resetUsername:i("resetUsername"),resetCancel:i("resetCancel"),registerUsername:i("registerUsername"),registerPassword:i("registerPassword"),registerConfirm:i("registerConfirm"),toggleMode:i("toggleMode"),credentialsStatus:i("credentialsStatus"),campaignList:i("campaignList"),campaignEmpty:i("campaignEmpty"),joinableSection:i("joinableSection"),joinableList:i("joinableList"),continueWithoutCampaign:i("continueWithoutCampaign"),campaignStatus:i("campaignStatus"),newCampaignToggle:i("newCampaignToggle"),newCampaignForm:i("newCampaignForm"),newCampaignName:i("newCampaignName"),newCampaignSystem:i("newCampaignSystem"),newCampaignVisibility:i("newCampaignVisibility"),newCampaignBanner:i("newCampaignBanner"),bannerPreview:i("bannerPreview"),newCampaignCancel:i("newCampaignCancel")},E=`
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mesa de jogo com dado de vinte lados">
  <ellipse cx="260" cy="212" rx="238" ry="168" fill="#e9f1fe"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#dbe7f6"/>
  <rect x="70" y="286" width="380" height="26" rx="13" fill="#c9dcf5"/>
  <rect x="96" y="312" width="16" height="34" rx="6" fill="#b6cdea"/>
  <rect x="408" y="312" width="16" height="34" rx="6" fill="#b6cdea"/>
  <g class="art-float">
    <path d="M260 96 330 136v80l-70 40-70-40v-80z" fill="#4a8cf7"/>
    <path d="M260 96v40l60 24 10-24zM190 136l10 24 60-24v-40zM260 296l-56-32 14-26 42 18 42-18 14 26z" fill="#3576e0" opacity=".55"/>
    <path d="M218 238h84l-42-78z" fill="#fff" opacity=".92"/>
    <text x="260" y="230" text-anchor="middle" font-family="Nunito,sans-serif" font-size="30" font-weight="800" fill="#3576e0">20</text>
  </g>
  <g transform="rotate(-12 150 258)"><g class="art-float-slow">
    <rect x="118" y="228" width="64" height="88" rx="8" fill="#fff" stroke="#dbe7f6" stroke-width="2"/>
    <rect x="128" y="240" width="44" height="30" rx="5" fill="#ffd166"/>
    <rect x="128" y="280" width="44" height="6" rx="3" fill="#e3e9f2"/>
    <rect x="128" y="292" width="30" height="6" rx="3" fill="#e3e9f2"/>
  </g></g>
  <g transform="rotate(9 384 262)">
    <rect x="352" y="230" width="64" height="88" rx="8" fill="#fff" stroke="#dbe7f6" stroke-width="2"/>
    <rect x="362" y="242" width="44" height="30" rx="5" fill="#ff8f6b"/>
    <rect x="362" y="282" width="44" height="6" rx="3" fill="#e3e9f2"/>
    <rect x="362" y="294" width="30" height="6" rx="3" fill="#e3e9f2"/>
  </g>
  <g>
    <path d="M448 250c0 20-8 34-8 34h-32s-8-14-8-34a24 24 0 0 1 48 0z" fill="#58c99b"/>
    <path d="M424 250v34" stroke="#3ba97c" stroke-width="3" stroke-linecap="round"/>
    <rect x="408" y="282" width="32" height="22" rx="5" fill="#f4b26a"/>
  </g>
  <g fill="#ffd166">
    <path class="art-float" d="m120 130 4.5 10.5L135 145l-10.5 4.5L120 160l-4.5-10.5L105 145l10.5-4.5z"/>
    <path class="art-float-slow" d="m396 108 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
    <path class="art-float-slow" d="m344 350 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
  </g>
</svg>`,R=`
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de aventura com bussola">
  <ellipse cx="260" cy="208" rx="238" ry="168" fill="#e6f7f0"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#d5eee2"/>
  <g transform="rotate(-4 260 220)">
    <rect x="110" y="128" width="300" height="196" rx="12" fill="#fff8ec" stroke="#eadfc6" stroke-width="3"/>
    <rect x="98" y="120" width="14" height="212" rx="7" fill="#e8b04b"/>
    <rect x="408" y="120" width="14" height="212" rx="7" fill="#e8b04b"/>
    <path d="M150 290c30-24 12-58 44-70s58 10 82-16 44-14 82-36" fill="none" stroke="#ff8f6b" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="m352 158 16 16m0-16-16 16" stroke="#e8493a" stroke-width="5" stroke-linecap="round"/>
    <path d="m196 180 14-24 14 24zm34 0 11-19 11 19z" fill="#58c99b"/>
    <path d="M170 250a8 8 0 0 1 16 0c0 6-8 14-8 14s-8-8-8-14z" fill="#4a8cf7"/>
    <circle cx="178" cy="250" r="3" fill="#fff"/>
  </g>
  <g transform="translate(388 88)"><g class="art-float">
    <circle r="34" fill="#4a8cf7"/>
    <circle r="26" fill="#fff"/>
    <g class="art-spin"><path d="M0-19 6 0 0 19-6 0z" fill="#e8493a"/><path d="M0-19 6 0h-12z" fill="#ff8f6b"/></g>
    <circle r="4" fill="#2b3445"/>
  </g></g>
  <g class="art-float-slow">
    <rect x="96" y="70" width="42" height="42" rx="9" fill="#6ea3f9"/>
    <circle cx="108" cy="82" r="3.5" fill="#fff"/><circle cx="126" cy="82" r="3.5" fill="#fff"/>
    <circle cx="108" cy="100" r="3.5" fill="#fff"/><circle cx="126" cy="100" r="3.5" fill="#fff"/>
    <circle cx="117" cy="91" r="3.5" fill="#fff"/>
  </g>
  <g fill="#ffd166">
    <path class="art-float-slow" d="m78 180 4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/>
    <path class="art-float" d="m448 210 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
  </g>
</svg>`,j=`
<svg viewBox="0 0 520 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Grimorio aberto com vela">
  <ellipse cx="260" cy="208" rx="238" ry="168" fill="#efeafd"/>
  <ellipse cx="260" cy="330" rx="180" ry="14" fill="#e2daf8"/>
  <g>
    <path d="M120 300c0-10 62-26 140-26s140 16 140 26v14H120z" fill="#b28cf7"/>
    <path d="M260 176c-34-18-96-20-124-10-6 2-10 7-10 13v96c0 8 8 13 16 11 26-7 84-5 118 12z" fill="#fff" stroke="#e2daf8" stroke-width="3"/>
    <path d="M260 176c34-18 96-20 124-10 6 2 10 7 10 13v96c0 8-8 13-16 11-26-7-84-5-118 12z" fill="#faf7ff" stroke="#e2daf8" stroke-width="3"/>
    <path d="M260 176v122" stroke="#d5c8f5" stroke-width="4"/>
    <g stroke="#d5c8f5" stroke-width="5" stroke-linecap="round">
      <path d="M154 196h74M154 216h74M154 236h50"/>
      <path d="M292 196h74M292 216h74M292 236h50"/>
    </g>
    <path d="m322 258 5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#b28cf7"/>
  </g>
  <g transform="translate(408 208)">
    <rect x="-18" y="0" width="36" height="70" rx="8" fill="#ff8f6b"/>
    <rect x="-24" y="62" width="48" height="14" rx="7" fill="#f4b26a"/>
    <path d="M0-2c8 10 6 18 0 22-6-4-8-12 0-22z" fill="#ffd166" class="art-flicker"/>
    <circle cx="0" cy="14" r="4" fill="#fff" opacity=".8"/>
  </g>
  <g transform="translate(110 224)"><g class="art-float-slow">
    <circle cy="34" r="26" fill="#58c99b"/>
    <path d="M-26 34a26 26 0 0 0 52 0z" fill="#3ba97c"/>
    <rect x="-8" y="-8" width="16" height="22" rx="4" fill="#8ad9ba"/>
    <rect x="-12" y="-14" width="24" height="10" rx="4" fill="#f4b26a"/>
    <circle cx="-6" cy="28" r="4" fill="#d9f4e8"/><circle cx="8" cy="42" r="3" fill="#d9f4e8"/>
  </g></g>
  <g fill="#ffd166">
    <path class="art-float" d="m150 110 4.5 10.5L165 125l-10.5 4.5L150 140l-4.5-10.5L135 125l10.5-4.5z"/>
    <path class="art-float-slow" d="m386 96 3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z"/>
    <path class="art-float" d="m440 150 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
  </g>
</svg>`,x=[E,R,j];function C(){a.stageArt&&(a.stageArt.innerHTML=x[Math.floor(Math.random()*x.length)])}async function U(){if(a.stageArt)try{const e=await c.request("/meta/login-art"),t=e&&Array.isArray(e.images)?e.images:[];if(!t.length){C();return}const r=t[Math.floor(Math.random()*t.length)],n=new Image;n.alt="",n.onload=()=>{a.stageArt.parentElement.classList.add("has-photo"),a.stageArt.replaceChildren(n),requestAnimationFrame(()=>n.classList.add("is-loaded"))},n.onerror=C,n.src=r}catch{C()}}U();const S={"cyberpunk-red":{label:"Cyberpunk RED",cls:"campaign-logo-cpr",mark:"<i>CYBER<br>PUNK</i><b>RED</b>"},dnd5e:{label:"D&D 5e",cls:"campaign-logo-dnd",mark:"<i>&amp;</i><b>5E</b>"},cthulhu:{label:"Call of Cthulhu",cls:"campaign-logo-coc",mark:"<i>CoC</i><b>7E</b>"},other:{label:"Outro sistema",cls:"campaign-logo-other",mark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7L12 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.3 15.6h9.4L12 8.7l-4.7 6.9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>'}};function _(e){return S[String(e||"")]||S["cyberpunk-red"]}function I(e,t){if(!e||e.hidden){t.hidden=!1;return}e.classList.add("step-leaving"),window.setTimeout(()=>{e.hidden=!0,e.classList.remove("step-leaving"),t.hidden=!1},200)}function o(e,t,r){e.textContent=t||"",e.className="status"+(r?" "+r:"")}function d(e,t){const r=e.querySelector(".btn-primary");r&&(r.disabled=t,r.classList.toggle("is-loading",t),r.querySelector(".btn-spinner").hidden=!t)}function h(e){const t=e==="register",r=e==="reset";a.loginForm.hidden=t||r,a.registerForm.hidden=!t,a.resetRequestForm.hidden=!r,a.toggleMode.hidden=r,a.toggleMode.textContent=t?"Ja tenho uma conta":"Criar uma conta",a.googleDivider.hidden=r,a.googleFallback.closest(".google-row").hidden=r,o(a.credentialsStatus,"","")}h("login");a.toggleMode.onclick=()=>h(a.registerForm.hidden?"register":"login");a.forgotPasswordLink.onclick=()=>h("reset");a.resetCancel.onclick=()=>h("login");function u(e){const t="/Limiar%20OS.dc-2.html"+(e?"?campaign="+encodeURIComponent(e):"");window.location.assign(t)}function N(e,t){const r=t&&t.role==="admin";return(Array.isArray(e)?e:[]).filter(n=>!n||n.status==="archived"?!1:r||n.isMember||n.created_by===t.username||n.createdBy===t.username)}function q(e,t){const r=t&&t.role==="admin";return(Array.isArray(e)?e:[]).filter(n=>!n||n.status==="archived"||r||n.isMember||n.created_by===t.username||n.createdBy===t.username?!1:!!(n.canJoin||n.myInviteId))}let f=null;const M=["#d6aa4e","#3fe0d0","#e6bc63","#7fe8db"];function D(e){let t=0;for(let r=0;r<e.length;r++)t=t*31+e.charCodeAt(r)>>>0;return M[t%M.length]}function G(e){return String(e||"?").trim().slice(0,2).toUpperCase()}function O(e){const t=e.slice(0,8),r=e.length-t.length,n=t.map(s=>{const p=s.role==="gm"||s.role==="admin",m=p?"var(--lm-gold)":"var(--lm-teal)",b=s.portraitUrl?`background-image:url(${g(s.portraitUrl)});--roster-ring:${m}`:`background:${D(s.username)};--roster-ring:${m}`,y=s.portraitUrl?"":g(G(s.username));return`
      <span class="roster-chip" title="${g(s.username)}">
        <span class="roster-chip-avatar" style="${b}">${y}</span>
        <span class="roster-chip-name">${g(s.username)}</span>
        <span class="roster-chip-role">${p?"Mestre":"Jogador"}</span>
      </span>
    `}).join(""),l=r>0?`<span class="roster-chip"><span class="roster-chip-more">+${r}</span></span>`:"";return`<span class="campaign-roster">${n}${l}</span>`}function L(e,t,r){const n=!!(r&&r.joinable),l=t&&t.role==="admin"||e.created_by===(t&&t.username)||e.createdBy===(t&&t.username),s=Array.isArray(e.roster)?e.roster:[],p=Number.isFinite(e.participantCount)?e.participantCount:s.length,m=_(e.system),b=e.visibility==="private"?"Privada":"Publica",y=e.status==="paused"?" · Pausada":"",v=e.bannerUrl||e.banner_url||"",A=v?` style="background-image:url(${g(v)})"`:"",$=n?e.myInviteId?'<span class="campaign-card-tag invite">Convite</span>':'<span class="campaign-card-tag player">Aberta</span>':`<span class="campaign-card-tag${l?"":" player"}">${l?"Mestre":"Jogador"}</span>`,z=n?e.myInviteId?"Aceitar convite":"Ver campanha":"Entrar na campanha";return`
    <button type="button" class="campaign-card${n?" joinable":""}" data-campaign-id="${g(e.id)}" data-campaign-mode="${n?"joinable":"member"}">
      <span class="campaign-card-top${v?" has-banner":""}"${A}>
        <span class="campaign-logo ${m.cls}">${m.mark}</span>
        <span class="campaign-card-body">
          <strong>${g(e.name)}</strong>
          <em>${g(m.label)} · ${b}${y}</em>
        </span>
        <span class="campaign-card-count"><b>${p}</b><small>jogador${p===1?"":"es"}</small></span>
      </span>
      ${s.length?O(s):""}
      <span class="campaign-card-foot">
        ${$}
        <span class="campaign-card-cta">${z} <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </span>
    </button>
  `}async function F(e){o(a.campaignStatus,"Carregando campanhas...","");try{const t=await c.campaigns.list(),r=N(t,e||{}),n=q(t,e||{});a.campaignEmpty.hidden=r.length>0,a.campaignEmpty.textContent=n.length>0?"Voce ainda nao entrou em nenhuma mesa, mas ha campanhas esperando abaixo.":"Voce ainda nao participa de nenhuma campanha. Crie uma ou aguarde um convite.",a.campaignList.innerHTML=r.map(l=>L(l,e)).join(""),a.joinableSection.hidden=n.length===0,a.joinableList.innerHTML=n.map(l=>L(l,e,{joinable:!0})).join(""),o(a.campaignStatus,"","")}catch(t){o(a.campaignStatus,t.message||"Nao foi possivel carregar campanhas","err")}}async function w(e){f=e||null,I(a.stepCredentials,a.stepCampaign);const t=f&&(f.role==="admin"||f.role==="gm");a.newCampaignToggle.hidden=!t,await F(f)}a.campaignList.addEventListener("click",e=>{const t=e.target.closest("[data-campaign-id]");t&&u(t.getAttribute("data-campaign-id"))});a.joinableList.addEventListener("click",e=>{e.target.closest("[data-campaign-id]")&&u("")});a.continueWithoutCampaign.onclick=()=>u("");a.newCampaignToggle.onclick=()=>{a.newCampaignForm.hidden=!1,a.newCampaignToggle.hidden=!0,a.newCampaignName.focus()};function k(){a.newCampaignBanner.value="",a.bannerPreview.hidden=!0,a.bannerPreview.style.backgroundImage=""}a.newCampaignBanner.addEventListener("change",()=>{const e=a.newCampaignBanner.files&&a.newCampaignBanner.files[0];if(!e){k();return}const t=URL.createObjectURL(e);a.bannerPreview.style.backgroundImage=`url(${t})`,a.bannerPreview.hidden=!1});a.newCampaignCancel.onclick=()=>{a.newCampaignForm.hidden=!0,a.newCampaignToggle.hidden=!1,a.newCampaignForm.reset(),k()};a.newCampaignForm.addEventListener("submit",async e=>{e.preventDefault();const t=a.newCampaignName.value.trim();if(!t)return;d(a.newCampaignForm,!0);const r={name:t,system:a.newCampaignSystem.value,visibility:a.newCampaignVisibility.value};try{const n=await c.campaigns.create(r),l=a.newCampaignBanner.files&&a.newCampaignBanner.files[0];if(n&&n.id&&l)try{const s=await c.uploads.image(l,{scope:"campaign-banner",ownerId:n.id});s&&s.url&&await c.campaigns.create({...r,id:n.id,bannerUrl:s.url})}catch{}a.newCampaignForm.hidden=!0,a.newCampaignToggle.hidden=!1,a.newCampaignForm.reset(),k(),await F(f),n&&n.id&&u(n.id)}catch(n){o(a.campaignStatus,n.message||"Nao foi possivel criar a campanha","err")}finally{d(a.newCampaignForm,!1)}});a.loginForm.addEventListener("submit",async e=>{e.preventDefault(),o(a.credentialsStatus,"",""),d(a.loginForm,!0);try{const t=await c.auth.login(a.loginUsername.value.trim(),a.loginPassword.value,a.loginRemember.checked);if(!t||!t.token)throw new Error("Credenciais invalidas");await w(t.user)}catch{o(a.credentialsStatus,"Credenciais invalidas","err")}finally{d(a.loginForm,!1)}});a.resetRequestForm.addEventListener("submit",async e=>{e.preventDefault();const t=a.resetUsername.value.trim();if(t){d(a.resetRequestForm,!0);try{await c.auth.requestPasswordReset(t)}catch{}finally{d(a.resetRequestForm,!1),a.resetRequestForm.reset(),o(a.credentialsStatus,"Se o usuario existir, um mestre ou administrador vai liberar uma nova senha em breve.",""),window.setTimeout(()=>h("login"),2600)}}});a.registerForm.addEventListener("submit",async e=>{if(e.preventDefault(),a.registerPassword.value.length<8){o(a.credentialsStatus,"Senha deve ter ao menos 8 caracteres","err");return}if(a.registerPassword.value!==a.registerConfirm.value){o(a.credentialsStatus,"Senhas nao conferem","err");return}o(a.credentialsStatus,"",""),d(a.registerForm,!0);try{const t=await c.auth.register(a.registerUsername.value.trim(),a.registerPassword.value);if(!t||!t.token)throw new Error("Nao foi possivel criar a conta");await w(t.user)}catch(t){o(a.credentialsStatus,t.message||"Nao foi possivel criar a conta","err")}finally{d(a.registerForm,!1)}});async function V(e){o(a.credentialsStatus,"Entrando com Google...","");try{const t=await c.request("/auth/google",{method:"POST",body:JSON.stringify({idToken:e.credential})});if(!t||!t.token)throw new Error("Falha no login com Google");T(t.token),await w(t.user)}catch(t){o(a.credentialsStatus,t.message||"Falha no login com Google","err")}}function H(e=20){return new Promise(t=>{const r=n=>{if(window.google&&window.google.accounts&&window.google.accounts.id)return t(window.google);if(n<=0)return t(null);setTimeout(()=>r(n-1),150)};r(e)})}async function J(){a.googleFallback.onclick=()=>{o(a.credentialsStatus,"Login com Google indisponivel: servidor sem GOOGLE_CLIENT_ID configurado.","err")};try{const e=await c.request("/meta/config"),t=e&&e.googleClientId;if(!t)return;const r=await H();if(!r)return;r.accounts.id.initialize({client_id:t,callback:V}),r.accounts.id.renderButton(a.googleButton,{type:"standard",shape:"pill",size:"large",width:330,locale:"pt-BR"}),a.googleFallback.hidden=!0}catch{}}async function W(){if(P())try{const e=await c.auth.session();if(e&&e.authenticated&&e.user){await w(e.user);return}}catch{}J()}W();
