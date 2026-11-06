/* Synchronisation Supabase Auth + table progress. Aucun secret serveur dans le navigateur. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const url = window.BTP_SUPABASE_URL || '';
  const key = window.BTP_SUPABASE_ANON_KEY || '';
  const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(url) && key.length > 20 && !!window.supabase?.createClient;
  const modal = $('#cloud-modal'), status = $('#cloud-status'), auth = $('#cloud-auth'), connected = $('#cloud-connected');
  let db = null, user = null, timer = null, loading = false, suppressSave = false;
  function notice(message){status.textContent=message;}
  function present(){
    auth.hidden=!!user || !configured;
    connected.hidden=!user;
    $('#cloud-connected-email').textContent=user ? `Connecté : ${user.email}` : '';
    const b=$('#cloud-account');
    if(b)b.textContent=user ? '☁ Compte connecté' : '☁ Compte / Synchronisation';
    if(!configured)notice('Le projet Supabase doit être configuré dans config.js. Le mode local reste utilisable.');
    else if(!user)notice('Connecte-toi par e-mail pour retrouver ta progression sur plusieurs appareils.');
  }
  window.openCloudAccount=()=>{modal.hidden=false;present()};
  $('#cloud-close').addEventListener('click',()=>{modal.hidden=true});
  modal.addEventListener('click',(e)=>{if(e.target===modal)modal.hidden=true});
  if(!configured){present();return;}
  db=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  async function pull(){
    if(!user)return;
    loading=true;
    try{
      const {data,error}=await db.from('btp_progress').select('payload').eq('user_id',user.id).maybeSingle();
      if(error)throw error;
      if(data?.payload && data.payload.done){
        suppressSave=true;
        window.applyCloudState(data.payload);
        suppressSave=false;
        notice('Progression Supabase récupérée et chargée.');
      }else{
        await push();
        notice('Ton compte est prêt. Ta progression actuelle est sauvegardée sur Supabase.');
      }
    }catch(e){notice('Erreur de chargement : '+e.message+' — Les données locales restent disponibles.');}
    finally{loading=false;suppressSave=false;present()}
  }
  async function push(){
    if(!user||suppressSave||loading)return;
    const snapshot=window.currentAppState();
    const {error}=await db.from('btp_progress').upsert({user_id:user.id,payload:snapshot,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
    notice('Progression synchronisée sur Supabase.');
  }
  window.queueCloudSave=()=>{
    if(!user||suppressSave||loading)return;
    clearTimeout(timer);
    timer=setTimeout(()=>{push().catch(e=>notice('Sauvegarde cloud impossible : '+e.message))},1000);
  };
  $('#cloud-login').addEventListener('click',async()=>{
    const email=$('#cloud-email').value.trim();
    if(!/^\S+@\S+\.\S+$/.test(email)){notice('Entre une adresse e-mail valide.');return;}
    try{
      notice('Envoi du lien de connexion...');
      const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
      if(error)throw error;
      notice('E-mail envoyé. Ouvre le lien reçu pour te connecter.');
    }catch(e){notice('Erreur de connexion : '+e.message)}
  });
  $('#cloud-sync').addEventListener('click',async()=>{try{await push()}catch(e){notice('Erreur de sauvegarde : '+e.message)}});
  $('#cloud-logout').addEventListener('click',async()=>{
    clearTimeout(timer);
    try{await db.auth.signOut();user=null;window.resetLocalAccount();notice('Déconnecté. Les informations de ce compte ont été retirées du navigateur.');present();}
    catch(e){notice('Erreur de déconnexion : '+e.message)}
  });
  db.auth.onAuthStateChange((_event,session)=>{
    const incoming=session?.user||null;
    if(incoming?.id!==user?.id){user=incoming;present();if(user)setTimeout(()=>pull(),0)}
  });
  db.auth.getSession().then(({data})=>{if(data?.session?.user && !user){user=data.session.user;present();pull()}else present()}).catch(e=>notice('Erreur Supabase : '+e.message));
})();
