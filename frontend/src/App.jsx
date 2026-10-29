import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, CalendarDays, Check, Clock3, Grid2X2, HelpCircle, Home, Info, KeyRound, LogOut, MapPin, Menu, Monitor, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Moon, UserRound, X } from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { auth } from './firebase.js';
import { signOut } from 'firebase/auth';
import { apiErrorMessage, authErrorMessage, authRouteState } from './authState.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
const cx = (...values) => values.filter(Boolean).join(' ');
const activeStatuses = new Set(['PENDING','APPROVED','WAITLISTED','CHECKED_OUT','RETURN_PENDING_CONFIRMATION','OVERDUE']);
const localDateTime = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
async function api(path, options = {}) {
  const currentUser = auth?.currentUser;
  const request = async (forceRefresh = false) => {
    let token = null;
    if (currentUser) {
      try { token = await currentUser.getIdToken(forceRefresh); }
      catch (error) {
        if (error?.code === 'auth/network-request-failed') throw new Error('Unable to refresh your Firebase session because the network is unavailable. Check your connection and retry.');
        if (['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled'].includes(error?.code)) {
          try { await signOut(auth); } catch { /* Auth state listener still handles a completed sign-out. */ }
          throw new Error('Your Firebase session has expired or was revoked. Sign in again to continue.');
        }
        throw new Error('Firebase could not provide a valid sign-in token. Sign in again and retry.');
      }
    }
    let response;
    try {
      response = await fetch(API + path, {
        ...options,
        headers: { ...(options.headers || {}), 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      throw new Error('Unable to connect to ShareSpace. Check your connection and retry.');
    }
    return { response, token };
  };

  let { response, token } = await request();
  let refreshed = false;
  if (response.status === 401 && currentUser) {
    refreshed = true;
    ({ response, token } = await request(true));
  }
  if (!response.ok) {
    let body = {};
    try { body = await response.json(); } catch { /* Non-JSON response. */ }
    const message = apiErrorMessage(response.status, body, { hasToken: Boolean(token), refreshed });
    const error = new Error(message); error.status = response.status; throw error;
  }
  return response.status === 204 ? null : response.json();
}

function App() {
  const session = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('sharespace-theme');
      return ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
    } catch { return 'system'; }
  });
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => { root.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme; };
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [theme]);
  const changeTheme = (nextTheme) => {
    try { localStorage.setItem('sharespace-theme', nextTheme); } catch { /* Theme still changes for this session. */ }
    setTheme(nextTheme);
  };
  const gate = authRouteState({ ...session, pathname: location.pathname });
  if (gate.view === 'loading') return <div className="auth-loading" role="status">Restoring your secure session…</div>;
  if (gate.view === 'auth') {
    return <Routes>
      <Route path="/login" element={<AuthScreen mode="login" theme={theme} onThemeChange={changeTheme}/>}/>
      <Route path="/register" element={<AuthScreen mode="register" theme={theme} onThemeChange={changeTheme}/>}/>
      <Route path="/forgot-password" element={<AuthScreen mode="forgot" theme={theme} onThemeChange={changeTheme}/>}/>
      <Route path="*" element={<Navigate to="/login" replace state={{ from: location }}/>} />
    </Routes>;
  }
  if (gate.view === 'redirect-login') return <Navigate to="/login" replace state={{ from: location }}/>;
  if (gate.view === 'redirect-workspace') {
    const destination = location.state?.from;
    return <Navigate to={destination ? `${destination.pathname || '/'}${destination.search || ''}${destination.hash || ''}` : '/'} replace/>;
  }
  return <Workspace session={session} theme={theme} onThemeChange={changeTheme}/>;
}

function Workspace({session, theme, onThemeChange}) {
  const navigate = useNavigate();
  const [resources,setResources]=useState([]),[bookings,setBookings]=useState([]),[incidents,setIncidents]=useState([]),[events,setEvents]=useState([]),[user,setUser]=useState(null);
  const [dataErrors,setDataErrors]=useState({}),[connection,setConnection]=useState(null),[actionError,setActionError]=useState(''),[notice,setNotice]=useState(''),[navOpen,setNavOpen]=useState(false),[busy,setBusy]=useState(false);
  const lock=useRef(false);
  const refresh=useCallback(async()=>{
    const results=await Promise.allSettled([api('/resources'),api('/bookings'),api('/incidents'),api('/users/me'),api('/audit-events')]), errors={};
    if(results[0].status==='fulfilled'){setResources(results[0].value);setConnection(true);}else{errors.resources=results[0].reason.message;setConnection(false);}
    if(results[1].status==='fulfilled')setBookings(results[1].value);else errors.bookings=results[1].reason.message;
    if(results[2].status==='fulfilled')setIncidents(results[2].value);else errors.incidents=results[2].reason.message;
    if(results[3].status==='fulfilled')setUser(results[3].value);else{setUser(null);errors.user=results[3].reason.message;}
    if(results[4].status==='fulfilled')setEvents(results[4].value);else errors.audit=results[4].reason.message;
    setDataErrors(errors);
  },[]);
  useEffect(()=>{refresh();},[refresh]);
  const doAction=async(request,message)=>{
    if(lock.current)return false;lock.current=true;setBusy(true);setActionError('');
    try{await request();await refresh();setNotice(message);window.setTimeout(()=>setNotice(''),4000);return true;}
    catch(error){setActionError(error.message);return false;}
    finally{setBusy(false);lock.current=false;}
  };
  const logout=async()=>{
    try { await session.logout(); navigate('/login',{replace:true}); }
    catch { setActionError('ShareSpace could not complete sign out. Please try again.'); }
  };
  const props={refresh,doAction,resources,bookings,incidents,events,user,dataErrors,busy};
  const accountName=user?.fullName||session.user?.displayName||'';
  const accountEmail=user?.email||session.user?.email||'';
  const accountInitials=accountName ? accountName.split(' ').map(x=>x[0]).join('').slice(0,2) : accountEmail.slice(0,1).toUpperCase();
  return <div className="app-shell">
    <aside className={cx('sidebar',navOpen&&'sidebar-open')}>
      <div className="brand"><div className="brand-mark"><Grid2X2 size={19}/></div><span>share<span className="brand-light">space</span></span><button className="icon-button mobile-close" onClick={()=>setNavOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace"><div className="workspace-logo"><Grid2X2 size={16}/></div><div><b>Campus resource library</b><small>ShareSpace</small></div></div>
      <div className="nav-label">CAMPUS</div><nav aria-label="Main navigation">
        <NavLink to="/" end className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><Home size={18}/>Overview</NavLink>
        <NavLink to="/discover" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><Search size={18}/>Explore resources<span className="nav-count">{resources.length}</span></NavLink>
        <NavLink to="/bookings" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><CalendarDays size={18}/>My bookings</NavLink>
        <NavLink to="/owner" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><ShieldCheck size={18}/>Owner approvals</NavLink>        <NavLink to="/incidents" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><AlertTriangle size={18}/>Incident reports</NavLink>
        <NavLink to="/history" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><Activity size={18}/>Activity history</NavLink>
        <NavLink to="/help" className={({isActive})=>cx('nav-item',isActive&&'selected')} onClick={()=>setNavOpen(false)}><HelpCircle size={18}/>Help centre</NavLink>
      </nav>
      <div className="sidebar-bottom"><NavLink to="/help" className="help-card"><span className="help-icon"><HelpCircle size={18}/></span><b>Need a hand?</b><span className="help-copy">Guidance for sharing campus resources.</span><span className="help-link">Visit Help Centre <ArrowRight size={13}/></span></NavLink>
        <NavLink to="/settings" className="profile profile-link"><span className="avatar">{session.user?.photoURL?<img src={session.user.photoURL} alt=""/>:accountInitials}</span><span className="profile-info"><b>{accountName||accountEmail||'Signed-in account'}</b><small>{accountEmail}</small></span><Settings size={17}/></NavLink>
        <button type="button" className="profile-signout" onClick={logout}><LogOut size={15}/>Sign out</button>
      </div>
    </aside>
    {navOpen&&<div className="scrim" onClick={()=>setNavOpen(false)}/>}
    <main className="main"><header className="topbar"><button className="icon-button menu-button" onClick={()=>setNavOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="crumb">ShareSpace <span>/</span> <strong>Campus resources</strong></div><div className="top-actions"><span className={cx('connection-chip',connection===false?'connection-error':connection===true?'connection-ok':'connection-loading')}><i/>{connection===false?'Connection unavailable':connection===true?'Campus library':'Connecting…'}</span><SettingsPopover session={session} backendUser={user} theme={theme} onThemeChange={onThemeChange} onSignOut={logout}/></div></header>
      {dataErrors.resources&&<div className="backend-note" role="alert"><span><AlertTriangle size={16}/></span><div><b>Unable to load resources</b><small>{dataErrors.resources}</small></div><button onClick={refresh} className="note-retry">Retry</button></div>}
      {session.registrationNotice&&<div className="backend-note" role="status"><span><Check size={16}/></span><div><b>Email verification</b><small>{session.registrationNotice}</small></div><button onClick={session.dismissRegistrationNotice} className="note-retry">Dismiss</button></div>}
      {actionError&&<div className="backend-note action-note" role="alert"><span><AlertTriangle size={16}/></span><div><b>Action could not be completed</b><small>{actionError}</small></div><button onClick={()=>setActionError('')} className="note-retry">Dismiss</button></div>}
      <div className="page-wrap"><Routes>
        <Route path="/" element={<Dashboard {...props}/>}/><Route path="/discover" element={<Discover {...props}/>}/><Route path="/resources/new" element={<ResourceForm {...props}/>}/><Route path="/resources/:id" element={<ResourceDetail {...props}/>}/>
        <Route path="/bookings" element={<Bookings {...props}/>}/><Route path="/bookings/:id" element={<BookingDetail {...props}/>}/><Route path="/owner" element={<OwnerQueue {...props}/>}/><Route path="/incidents" element={<Incidents {...props}/>}/><Route path="/history" element={<History {...props}/>}/><Route path="/help" element={<HelpPage/>}/><Route path="/settings" element={<SettingsPage {...props} session={session}/>}/><Route path="*" element={<NotFound/>}/>
      </Routes></div>
    </main>{notice&&<div className="toast" role="status"><Check size={17}/>{notice}</div>}
  </div>;
}
function AuthScreen({mode, theme, onThemeChange}) {
  const session = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const registering = mode === 'register';
  const forgot = mode === 'forgot';
  const returnPath = location.state?.from;
  const destination = returnPath ? `${returnPath.pathname || '/'}${returnPath.search || ''}${returnPath.hash || ''}` : '/';

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (!session.configured) { setError('Firebase is not configured. Copy frontend/.env.example to frontend/.env.local and add your Firebase web app values.'); return; }
    if (registering && name.trim().length < 2) { setError('Enter your name (at least 2 characters).'); return; }
    if (registering && password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      if (forgot) {
        await session.resetPassword(email);
        setMessage('If this address has a ShareSpace account, Firebase has sent a password reset email.');
      } else if (registering) {
        const result = await session.register(name, email, password);
        setMessage(result.verificationEmailSent ? 'Account created. Check your email for a verification link.' : 'Account created, but Firebase could not send a verification email.');
        navigate(destination, { replace: true });
      } else {
        await session.login(email, password);
        navigate(destination, { replace: true });
      }
    } catch (authError) {
      setError(authErrorMessage(authError.code));
    } finally { setBusy(false); }
  };

  return <main className="auth-page"><div className="auth-settings"><SettingsPopover session={session} theme={theme} onThemeChange={onThemeChange}/></div><section className="auth-card">
    <NavLink className="auth-brand" to="/login"><span className="brand-mark"><Grid2X2 size={19}/></span><span>share<span>space</span></span></NavLink>
    <div className="eyebrow">CAMPUS RESOURCE LIBRARY</div>
    <h1>{forgot ? 'Reset your password' : registering ? 'Create your account' : 'Welcome back'}</h1>
    <p className="auth-intro">{forgot ? 'We’ll email you a secure link to reset your password.' : registering ? 'Create a ShareSpace account to request and manage campus resources.' : 'Sign in to continue to your campus resources.'}</p>
    {!session.configured && <p className="auth-alert" role="alert">Firebase web configuration is missing. Add the values shown in <code>frontend/.env.example</code> to <code>frontend/.env.local</code>, then restart Vite.</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="auth-success" role="status">{message}</p>}
    <form className="auth-form" onSubmit={submit}>
      {registering && <label>Full name<input autoComplete="name" required minLength={2} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>}
      <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
      {!forgot && <label>Password<input type="password" autoComplete={registering?'new-password':'current-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>}
      {registering && <label>Confirm password<input type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label>}
      <button className="btn btn-primary auth-submit" disabled={busy||!session.configured}>{busy?'Please wait…':forgot?'Send reset link':registering?'Create account':'Sign in'}<ArrowRight size={16}/></button>
    </form>
    <nav className="auth-links" aria-label="Account options">
      {mode !== 'login' && <NavLink to="/login" state={location.state}>Sign in</NavLink>}
      {mode !== 'register' && !forgot && <NavLink to="/register" state={location.state}>Create account</NavLink>}
      {mode === 'login' && <NavLink to="/forgot-password" state={location.state}>Forgot password?</NavLink>}
    </nav>
    <p className="auth-footnote">Your account is secured by Firebase. ShareSpace access and permissions are checked by the backend.</p>
  </section></main>;
}

function SettingsPopover({session, backendUser, theme, onThemeChange, onSignOut}) {
  const [open,setOpen]=useState(false),[resetBusy,setResetBusy]=useState(false),[feedback,setFeedback]=useState('');
  const popoverRef=useRef(null),triggerRef=useRef(null),navigate=useNavigate();
  const firebaseUser=session.user;
  const email=backendUser?.email||firebaseUser?.email||'';
  const name=backendUser?.fullName||firebaseUser?.displayName||'';
  const initials=name?name.split(' ').map(part=>part[0]).join('').slice(0,2):email.slice(0,1).toUpperCase();

  useEffect(()=>{
    if(!open)return undefined;
    const onPointerDown=event=>{if(!popoverRef.current?.contains(event.target)&&!triggerRef.current?.contains(event.target))setOpen(false);};
    const onKeyDown=event=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus();}};
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    window.requestAnimationFrame(()=>popoverRef.current?.querySelector('[data-settings-first]')?.focus());
    return()=>{document.removeEventListener('pointerdown',onPointerDown);document.removeEventListener('keydown',onKeyDown);};
  },[open]);

  const close=()=>setOpen(false);
  const resetPassword=async()=>{
    if(!email)return;
    setResetBusy(true);setFeedback('');
    try{await session.resetPassword(email);setFeedback('If this address has a ShareSpace account, Firebase sent a password reset email.');}
    catch(error){setFeedback(authErrorMessage(error.code));}
    finally{setResetBusy(false);}
  };
  const signOut=async()=>{
    if(!onSignOut){close();return;}
    await onSignOut();
  };

  return <div className="settings-anchor">
    <button ref={triggerRef} type="button" className="icon-button account-button" aria-label="Open settings" aria-haspopup="dialog" aria-expanded={open} aria-controls="settings-popover" onClick={()=>{setFeedback('');setOpen(value=>!value);}}><Settings size={18}/></button>
    {open&&<section ref={popoverRef} className="settings-popover" id="settings-popover" role="dialog" aria-label="ShareSpace settings">
      <div className="settings-popover-head">
        {firebaseUser?<><span className="settings-avatar">{firebaseUser.photoURL?<img src={firebaseUser.photoURL} alt=""/>:initials}</span><span className="settings-account-copy"><b>{name||email||'Signed-in account'}</b>{email&&<small>{email}</small>}<small className="auth-status"><i/>Signed in{firebaseUser.emailVerified?' · email verified':''}</small></span></>:<span className="settings-avatar"><UserRound size={18}/></span>}
      </div>
      {!firebaseUser&&<div className="settings-guest"><b>You’re not signed in.</b><span>Sign in to manage your campus account.</span><div><button type="button" data-settings-first className="settings-action" onClick={()=>{close();navigate('/login');}}>Sign in</button><button type="button" className="settings-action settings-action-muted" onClick={()=>{close();navigate('/register');}}>Create account</button></div></div>}
      {firebaseUser&&<>
        <div className="settings-section"><span className="settings-section-label">ACCOUNT</span>
          <NavLink data-settings-first to="/settings" className="settings-item" onClick={close}><UserRound size={16}/><span>Account information</span><ArrowRight size={14}/></NavLink>
          <button type="button" className="settings-item" onClick={resetPassword} disabled={!email||resetBusy}><KeyRound size={16}/><span>{resetBusy?'Sending reset link…':'Password reset'}</span></button>
          <div className="settings-security"><ShieldCheck size={16}/><span>Account security<small>{firebaseUser.emailVerified?'Verified email':'Email verification pending'}</small></span></div>
        </div>
        {feedback&&<p className="settings-feedback" role="status">{feedback}</p>}
      </>}
      <div className="settings-section"><span className="settings-section-label">APPEARANCE</span><div className="theme-options" role="group" aria-label="Color theme">
        {[['light','Light',Sun],['dark','Dark',Moon],['system','System',Monitor]].map(([value,label,Icon])=><button key={value} type="button" className={cx('theme-option',theme===value&&'theme-option-active')} aria-pressed={theme===value} onClick={()=>onThemeChange(value)}><Icon size={15}/>{label}</button>)}
      </div></div>
      <div className="settings-section settings-links"><span className="settings-section-label">SUPPORT</span>
        <NavLink to="/help" className="settings-item" onClick={close}><HelpCircle size={16}/><span>Help centre</span><ArrowRight size={14}/></NavLink>
        <div className="settings-about"><Info size={16}/><span>About ShareSpace<small>Campus resource sharing · v1.0.0</small></span></div>
        <div className="settings-unavailable" aria-disabled="true"><span>Notification preferences</span><small>Not supported by the current service</small></div>
      </div>
      {firebaseUser&&<button type="button" className="settings-signout" onClick={signOut}><LogOut size={16}/>Sign out</button>}
    </section>}
  </div>;
}

function PageHead({eyebrow,title,description,action}){return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
function LoadMessage({message}){return <div className="load-message" role="status">{message}</div>;}
function Dashboard(p){
  const navigate=useNavigate(), mine=p.user?p.bookings.filter(b=>b.requester?.id===p.user.id||b.requesterEmail===p.user.email):[];
  const today=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date());
  return <>
    <div className="welcome"><div><div className="eyebrow light-eyebrow">{today}</div><h1>Share more of campus <span>✳</span></h1><p>Discover useful resources shared by your campus community.</p></div><button className="btn btn-white" onClick={()=>navigate('/discover')}><Search size={16}/>Explore resources</button><div className="welcome-orb orb-one"/><div className="welcome-orb orb-two"/></div>    <section className="stats-grid"><Stat icon={<Grid2X2/>} label="Resources to explore" value={p.resources.length} foot="Published campus listings" tone="mint"/><Stat icon={<CalendarDays/>} label="Active bookings" value={p.dataErrors.bookings?'—':mine.filter(b=>activeStatuses.has(b.status)).length} foot={p.dataErrors.bookings?'Account access unavailable':'Current reservations'} tone="blue"/><Stat icon={<Clock3/>} label="Awaiting approval" value={p.dataErrors.bookings?'—':mine.filter(b=>b.status==='PENDING').length} foot={p.dataErrors.bookings?'Account access unavailable':'Requests with owners'} tone="amber"/></section>
    <section className="section-block"><div className="section-heading"><div><h2>Explore campus resources</h2><p>Equipment and spaces currently available to request.</p></div><button className="text-link" onClick={()=>navigate('/discover')}>Browse resources <ArrowRight size={15}/></button></div>{p.dataErrors.resources?<LoadMessage message={p.dataErrors.resources}/>:<ResourceGrid resources={p.resources.slice(0,3)} compact/>}</section>
    <section className="lower-grid"><div className="panel"><div className="section-heading panel-heading"><div><h2>Recent bookings</h2><p>Your requests and reservations.</p></div><button className="text-link" onClick={()=>navigate('/bookings')}>View bookings <ArrowRight size={15}/></button></div>{p.dataErrors.bookings?<LoadMessage message={p.dataErrors.bookings}/>:mine.length?mine.slice(0,3).map(b=><BookingRow key={b.id} booking={b}/>):<Empty icon={<CalendarDays/>} title="No bookings to show" body="Your booking list is empty or your account is not signed in." action="Explore resources" onClick={()=>navigate('/discover')}/>}</div><div className="panel campus-panel"><div className="campus-top"><div className="campus-icon"><Sparkles size={18}/></div><span>SHARED WITH CARE</span></div><h3>Good things happen when we share.</h3><p>Read usage guidance, record condition at handoff and return, and report issues through your booking.</p><NavLink className="campus-foot" to="/help#guidelines"><ShieldCheck size={16}/>Sharing guidance <ArrowRight size={14}/></NavLink></div></section>
  </>;
}
function Stat({icon,label,value,foot,tone}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><i className={'stat-icon '+tone}>{icon}</i></div><strong>{value}</strong><small>{foot}</small></div>;}
function Discover(p){
  const navigate=useNavigate(),[query,setQuery]=useState(''),[category,setCategory]=useState(''),[location,setLocation]=useState('');
  const categories=[...new Set(p.resources.map(r=>r.category).filter(Boolean))].sort(),locations=[...new Set(p.resources.map(r=>r.location).filter(Boolean))].sort();
  const rows=p.resources.filter(r=>(!category||r.category===category)&&(!location||r.location===location)&&(r.name+' '+r.description+' '+r.category+' '+r.location).toLowerCase().includes(query.toLowerCase()));
  return <><PageHead eyebrow="RESOURCE LIBRARY" title="Explore resources" description="Find equipment and spaces shared by your campus community." action={<button className="btn btn-primary" onClick={()=>navigate('/resources/new')}><Plus size={16}/>List a resource</button>}/>
    <div className="filters"><div className="searchbox"><Search size={17}/><input aria-label="Search resources" placeholder="Search tools, spaces, and more..." value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X size={15}/></button>}</div>
      <label className="select-wrap"><SlidersHorizontal size={15}/><select aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(v=><option key={v}>{v}</option>)}</select></label>
      <label className="select-wrap"><MapPin size={15}/><select aria-label="Filter by location" value={location} onChange={e=>setLocation(e.target.value)}><option value="">All locations</option>{locations.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="results-meta">Showing <b>{rows.length} resources</b></div>{p.dataErrors.resources?<LoadMessage message={p.dataErrors.resources}/>:<ResourceGrid resources={rows}/>}
  </>;
}function ResourceGrid({resources,compact}){if(!resources.length)return <Empty icon={<Search/>} title="No resources available" body="There are no matching published resources. Change your filters or check back later."/>;return <div className={cx('resource-grid',compact&&'compact-grid')}>{resources.map((r,i)=><ResourceCard key={r.id} resource={r} index={i}/>)}</div>;}
function ResourceCard({resource,index}){
  const navigate=useNavigate(),owner=resource.ownerName||resource.owner?.fullName;
  return <article className="resource-card" role="link" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')navigate('/resources/'+resource.id);}} onClick={()=>navigate('/resources/'+resource.id)}>
    <div className="resource-image">{resource.imageUrl?<img src={resource.imageUrl} alt={resource.name}/>:<div className="resource-image-empty"><Grid2X2 size={30}/></div>}<span className="available"><i/>{resource.status==='AVAILABLE'?'Available':(resource.status||'Status unavailable').replaceAll('_',' ').toLowerCase()}</span><div className="image-number">{String(index+1).padStart(2,'0')}</div></div>
    <div className="resource-body"><div className="resource-category">{resource.category||'Campus resource'}</div><h3>{resource.name}</h3><div className="resource-location"><MapPin size={14}/>{resource.location}</div><p className="resource-description">{resource.description}</p><div className="resource-footer"><div className="owner-mini"><span>{owner?owner.split(' ').map(v=>v[0]).join('').slice(0,2):'—'}</span><small>{owner?<>Shared by <b>{owner}</b></>:'Owner details unavailable'}</small></div><span className="circle-arrow" aria-hidden="true"><ArrowUpRight size={16}/></span></div>{resource.requiresTraining&&<div className="training-note"><ShieldCheck size={13}/>Training required</div>}</div>
  </article>;
}
function ResourceDetail(p) {
  const {id} = useParams(), navigate = useNavigate(), resource = p.resources.find(r => String(r.id) === id);
  const [start,setStart] = useState(''), [end,setEnd] = useState(''), [purpose,setPurpose] = useState(''), [validation,setValidation] = useState('');
  const duration = start && end ? (new Date(end)-new Date(start))/3600000 : 0;
  const invalid = !start || !end || new Date(start) <= new Date() || new Date(end) <= new Date(start) || duration > Number(resource?.maxBookingHours || 168);
  const submit = async e => {
    e.preventDefault();
    if (invalid) { setValidation('Choose future times in order, within the resource booking limit.'); return; }
    if (!purpose.trim()) { setValidation('Enter the purpose for this request.'); return; }
    setValidation('');
    const ok = await p.doAction(() => api('/bookings',{method:'POST',body:JSON.stringify({resourceId:resource.id,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),purpose:purpose.trim()})}), 'Booking request submitted.');
    if (ok) { setStart(''); setEnd(''); setPurpose(''); navigate('/bookings'); }
  };
  if (!resource) return <Empty icon={<Search/>} title="Resource unavailable" body={p.dataErrors.resources || 'This resource is not in the current published listings.'} action="Back to discovery" onClick={() => navigate('/discover')}/>;
  return <>
    <button className="back-link" onClick={() => navigate('/discover')}>← All resources</button>
    <div className="detail-layout"><div>{resource.imageUrl && <img className="detail-image" src={resource.imageUrl} alt={resource.name}/>}<div className="detail-copy"><div className="resource-category">{resource.category}</div><h1>{resource.name}</h1><p>{resource.description}</p><div className="detail-meta"><span><MapPin size={16}/>{resource.location}</span><span><Clock3 size={16}/>Up to {resource.maxBookingHours} hours</span><span><ShieldCheck size={16}/>{resource.requiresApproval?'Owner approval required':'May be approved immediately'}</span></div><h2>Usage guidance</h2><p>{resource.usageRules || 'Follow the owner’s instructions and return the resource in its received condition.'}</p>{resource.requiresTraining && <div className="eligibility-box"><ShieldCheck/><div><b>Training required</b><p>{resource.requiredTrainingDescription || 'The owner may require verified training before approval.'}</p></div></div>}</div></div>
      <form className="panel request-panel" onSubmit={submit} noValidate><div className="eyebrow">BOOK THIS RESOURCE</div><h2>Request a time</h2><p>Availability, eligibility, approval, and fair-use limits are verified by ShareSpace.</p>
        <label>Start time<input type="datetime-local" min={localDateTime(new Date())} required value={start} aria-invalid={Boolean(validation && (!start || new Date(start) <= new Date()))} onChange={e => { setStart(e.target.value); setValidation(''); }}/></label>
        <label>End time<input type="datetime-local" min={start || localDateTime(new Date())} required value={end} aria-invalid={Boolean(validation && (!end || new Date(end) <= new Date(start)))} onChange={e => { setEnd(e.target.value); setValidation(''); }}/></label>
        <label>Purpose<textarea rows="3" required maxLength="1000" value={purpose} onChange={e => { setPurpose(e.target.value); setValidation(''); }} placeholder="What will you use this resource for?"/></label>
        {validation && <p className="field-error" role="alert">{validation}</p>}
        <button className="btn btn-primary full" disabled={p.busy}>{p.busy?'Sending request…':'Request booking'} <ArrowRight size={16}/></button>
      </form>
    </div>
  </>;
}

function ResourceForm(p) {
  const [form,setForm] = useState({name:'',category:'',location:'',description:'',usageRules:'',imageUrl:'',maxBookingHours:'4',requiresTraining:false,requiredTrainingDescription:'',requiresApproval:true});
  const [errors,setErrors] = useState({});
  const navigate = useNavigate();
  const change = e => { const {name,type,value,checked} = e.target; setForm(prev => ({...prev,[name]:type==='checkbox'?checked:value})); setErrors(prev => ({...prev,[name]:''})); };
  const submit = async e => {
    e.preventDefault();
    const next = {};
    ['name','category','location','description'].forEach(k => {if(!form[k].trim()) next[k]='This field is required.';});
    const hours = Number(form.maxBookingHours);
    if(!Number.isInteger(hours)||hours<1||hours>168) next.maxBookingHours='Enter a whole number from 1 to 168.';
    if(form.imageUrl && !form.imageUrl.startsWith('http://') && !form.imageUrl.startsWith('https://')) next.imageUrl='Use a valid http or https image URL.';
    setErrors(next);
    if(Object.keys(next).length) return;    const payload = {...form,name:form.name.trim(),category:form.category.trim(),location:form.location.trim(),description:form.description.trim(),usageRules:form.usageRules.trim(),imageUrl:form.imageUrl.trim()||null,requiredTrainingDescription:form.requiredTrainingDescription.trim()||null,maxBookingHours:hours};
    const ok = await p.doAction(() => api('/resources',{method:'POST',body:JSON.stringify(payload)}),'Resource published successfully.');
    if(ok) { setForm({name:'',category:'',location:'',description:'',usageRules:'',imageUrl:'',maxBookingHours:'4',requiresTraining:false,requiredTrainingDescription:'',requiresApproval:true}); navigate('/discover'); }
  };
  const errorFor = key => errors[key] && <span className="field-error" role="alert">{errors[key]}</span>;
  return <>
    <PageHead eyebrow="CONTRIBUTE" title="Publish a resource" description="Make campus equipment or spaces available to your community."/>
    <form className="panel form-panel" onSubmit={submit} noValidate>
      <label>Resource name<input name="name" required maxLength="255" value={form.name} onChange={change} aria-invalid={Boolean(errors.name)} placeholder="e.g. DSLR camera kit"/>{errorFor('name')}</label>
      <div className="form-two"><label>Category<input name="category" required maxLength="120" value={form.category} onChange={change} aria-invalid={Boolean(errors.category)} placeholder="Photography"/>{errorFor('category')}</label><label>Location<input name="location" required maxLength="255" value={form.location} onChange={change} aria-invalid={Boolean(errors.location)} placeholder="Building and room"/>{errorFor('location')}</label></div>
      <label>Description<textarea name="description" required maxLength="3000" rows="4" value={form.description} onChange={change} aria-invalid={Boolean(errors.description)} placeholder="What should borrowers know?"/>{errorFor('description')}</label>
      <label>Usage guidance<textarea name="usageRules" maxLength="2000" rows="3" value={form.usageRules} onChange={change} placeholder="Care, pickup, or return instructions"/></label>
      <label>Image URL <span className="optional-label">Optional</span><input name="imageUrl" type="url" value={form.imageUrl} onChange={change} aria-invalid={Boolean(errors.imageUrl)} placeholder="https://…"/>{errorFor('imageUrl')}</label>
      <label>Maximum booking duration (hours)<input type="number" min="1" max="168" step="1" name="maxBookingHours" value={form.maxBookingHours} onChange={change} aria-invalid={Boolean(errors.maxBookingHours)}/>{errorFor('maxBookingHours')}</label>
      <label className="check-label"><input type="checkbox" name="requiresApproval" checked={form.requiresApproval} onChange={change}/>Require owner approval</label><label className="check-label"><input type="checkbox" name="requiresTraining" checked={form.requiresTraining} onChange={change}/>Requires verified training</label>
      {form.requiresTraining && <label>Required training description <span className="optional-label">Optional</span><input name="requiredTrainingDescription" maxLength="255" value={form.requiredTrainingDescription} onChange={change}/></label>}
      <button className="btn btn-primary" disabled={p.busy}><Plus size={16}/>{p.busy?'Publishing…':'Publish resource'}</button>
    </form>
  </>;
}

function Bookings(p) {
  const mine = p.user ? p.bookings.filter(b => b.requester?.id===p.user.id || b.requesterEmail===p.user.email) : [];
  return <><PageHead eyebrow="YOUR ACTIVITY" title="My bookings" description="Requests, reservations, and returns in one place." action={<NavLink className="btn btn-primary" to="/discover"><Plus size={16}/>Find a resource</NavLink>}/>
    {p.dataErrors.bookings ? <LoadMessage message={p.dataErrors.bookings}/> : <div className="panel list-panel">{mine.length ? mine.map(b => <BookingRow key={b.id} booking={b} clickable/>) : <Empty icon={<CalendarDays/>} title="No bookings to show" body="Your booking list is empty or your account is not signed in."/>}</div>}
  </>;
}
function BookingRow({booking,clickable}) {
  const navigate=useNavigate(), date=booking.startTime?new Date(booking.startTime):null, title=booking.resourceName||booking.resource?.name||('Booking #'+booking.id);
  return <div className={cx('booking-row',clickable&&'clickable')} role={clickable?'link':undefined} tabIndex={clickable?0:undefined} onKeyDown={e=>{if(clickable&&e.key==='Enter')navigate('/bookings/'+booking.id);}} onClick={()=>clickable&&navigate('/bookings/'+booking.id)}>    <div className="booking-cal"><span>{date?date.toLocaleString(undefined,{month:'short'}):'—'}</span><b>{date?date.getDate():'?'}</b></div><div className="booking-main"><b>{title}</b><small>{date?date.toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'}):'Time not set'}</small></div><Status status={booking.status}/><ArrowRight className="booking-arrow" size={16}/>
  </div>;
}
function Status({status}) { const text=(status||'UNKNOWN').toLowerCase().replaceAll('_',' '); return <span className={'status status-'+text.split(' ')[0]}>{text}</span>; }

function OwnerQueue(p) {
  const pending=p.bookings.filter(b=>b.status==='PENDING'&&(b.resourceOwnerEmail===p.user?.email||b.resource?.owner?.email===p.user?.email));
  const [decision,setDecision]=useState(null),[reason,setReason]=useState('');
  const submit=async e=>{e.preventDefault();if(!decision||!reason.trim())return;const ok=await p.doAction(()=>api('/bookings/'+decision.id+'/'+decision.action,{method:'POST',body:JSON.stringify({reason:reason.trim()})}),decision.action==='approve'?'Booking approved.':'Request rejected.');if(ok){setDecision(null);setReason('');}};
  return <>
    <PageHead eyebrow="OWNER TOOLS" title="Approval queue" description="Review requests for resources you share."/>
    {p.dataErrors.bookings?<LoadMessage message={p.dataErrors.bookings}/>:<div className="panel list-panel">{pending.length?pending.map(b=><div key={b.id} className="approval-row"><div className="approval-avatar">{(b.requesterName||b.requester?.fullName||'—').split(' ').map(v=>v[0]).join('')}</div><div className="approval-info"><b>{b.resourceName||b.resource?.name}</b><small>Requested by {b.requesterName||b.requester?.fullName||'Requester'} · {b.purpose}</small><small>{b.startTime?new Date(b.startTime).toLocaleString():''} – {b.endTime?new Date(b.endTime).toLocaleString():''}</small></div><div className="approval-actions"><button disabled={p.busy} className="btn btn-outline" onClick={()=>{setDecision({id:b.id,action:'reject'});setReason('');}}>Decline</button><button disabled={p.busy} className="btn btn-primary" onClick={()=>{setDecision({id:b.id,action:'approve'});setReason('');}}><Check size={15}/>Approve</button></div></div>):<Empty icon={<ShieldCheck/>} title="No requests to review" body="Requests for resources you own will appear here."/>}</div>}
    {decision&&<div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDecision(null);}}><form className="panel decision-modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onSubmit={submit}><button type="button" className="icon-button modal-close" aria-label="Close" onClick={()=>setDecision(null)}><X size={18}/></button><div className="eyebrow">OWNER DECISION</div><h2 id="decision-title">{decision.action==='approve'?'Approve request':'Decline request'}</h2><p>A reason will be recorded with this decision.</p><label>Decision reason<textarea autoFocus required maxLength="500" rows="4" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Write a concise reason…"/></label><div className="approval-actions"><button type="button" className="btn btn-outline" onClick={()=>setDecision(null)}>Cancel</button><button className="btn btn-primary" disabled={p.busy||!reason.trim()}>{p.busy?'Saving…':'Confirm decision'}</button></div></form></div>}
  </>;
}
function BookingDetail(p) {
  const {id}=useParams(), booking=p.bookings.find(b=>String(b.id)===id);
  const [description,setDescription]=useState(''),[incident,setIncident]=useState(''),[reports,setReports]=useState([]),[reportError,setReportError]=useState('');
  const refreshReports=useCallback(()=>api('/bookings/'+id+'/condition-reports').then(setReports).catch(e=>setReportError(e.message)),[id]);
  useEffect(()=>{refreshReports();},[refreshReports]);
  const run=async(path,body,message)=>{const ok=await p.doAction(()=>api('/bookings/'+id+'/'+path,{method:'POST',body:JSON.stringify(body||{})}),message);if(ok&&path==='condition-reports'){await refreshReports();setDescription('');}return ok;};
  if(!booking) return <Empty icon={<CalendarDays/>} title="Booking unavailable" body={p.dataErrors.bookings||'Open this page from a booking in your account.'} action="My bookings" onClick={()=>window.history.back()}/>;
  const before=reports.some(r=>r.reportType==='BEFORE'),after=reports.some(r=>r.reportType==='AFTER');
  return <>
    <PageHead eyebrow={'BOOKING #'+id} title={booking.resourceName||booking.resource?.name||'Booking details'} description={booking.purpose||'Reservation details and next steps.'} action={<Status status={booking.status}/>}/>
    <div className="detail-layout"><div className="panel lifecycle"><h2>Booking timeline</h2><div className="timeline">
      <div className="timeline-item done"><i/><div><b>Request submitted</b><small>{booking.createdAt?new Date(booking.createdAt).toLocaleString():'Request recorded'}</small></div></div>
      <div className={cx('timeline-item',['APPROVED','CHECKED_OUT','RETURN_PENDING_CONFIRMATION','COMPLETED'].includes(booking.status)&&'done')}><i/><div><b>Owner decision</b><small>{booking.decisionReason||'Awaiting owner review'}</small></div></div>
      <div className={cx('timeline-item',['CHECKED_OUT','RETURN_PENDING_CONFIRMATION','COMPLETED'].includes(booking.status)&&'done')}><i/><div><b>Check-in</b><small>{before?'Before condition recorded':'Record initial condition before pickup.'}</small></div></div>
      <div className={cx('timeline-item',booking.status==='COMPLETED'&&'done')}><i/><div><b>Return confirmation</b><small>{after?'After condition recorded':'Record return condition, then await owner confirmation.'}</small></div></div>
    </div>
    {reportError&&<p className="field-error" role="alert">{reportError}</p>}
    <h2 className="report-heading">Condition report</h2><label>Describe the item’s current condition<textarea rows="3" maxLength="2000" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Record visible wear, damage, or other relevant condition…"/></label>
    <div className="inline-actions"><button className="btn btn-outline" disabled={p.busy||!description.trim()||booking.status!=='APPROVED'||before} onClick={()=>run('condition-reports',{reportType:'BEFORE',description:description.trim()},'Before condition report saved.')}>Record before</button><button className="btn btn-outline" disabled={p.busy||!description.trim()||booking.status!=='CHECKED_OUT'||after} onClick={()=>run('condition-reports',{reportType:'AFTER',description:description.trim()},'After condition report saved.')}>Record after</button></div>
    </div><div className="panel request-panel"><div className="eyebrow">NEXT STEP</div><h2>Manage booking</h2><p>Each update is verified by ShareSpace.</p>
      {booking.status==='APPROVED'&&<button className="btn btn-primary full" disabled={p.busy||!before} onClick={()=>run('check-in',{},'Checked in successfully.')}>Check in resource <ArrowRight size={16}/></button>}
      {booking.status==='CHECKED_OUT'&&<button className="btn btn-primary full" disabled={p.busy||!after} onClick={()=>run('return',{},'Return submitted for owner confirmation.')}>Submit return <ArrowRight size={16}/></button>}
      {booking.status==='RETURN_PENDING_CONFIRMATION'&&<button className="btn btn-primary full" disabled={p.busy} onClick={()=>run('confirm-return',{},'Return confirmed.')}>Confirm return <Check size={16}/></button>}
      {booking.status==='PENDING'&&<button className="btn btn-outline full" disabled={p.busy} onClick={()=>run('cancel',{},'Booking request cancelled.')}>Cancel request</button>}      <label>Report an issue<textarea rows="3" maxLength="2000" value={incident} onChange={e=>setIncident(e.target.value)} placeholder="Describe damage, delay, or another concern…"/></label>
      <button className="btn btn-outline full" disabled={p.busy||!incident.trim()} onClick={async()=>{if(await p.doAction(()=>api('/bookings/'+id+'/incidents',{method:'POST',body:JSON.stringify({type:'OTHER',description:incident.trim()})}),'Incident submitted for review.'))setIncident('');}}><AlertTriangle size={15}/>Submit incident report</button>
    </div></div>
  </>;
}
function Incidents(p) {
  const [bookingId,setBookingId]=useState(''),[type,setType]=useState('OTHER'),[description,setDescription]=useState('');
  const allowed=p.user?p.bookings.filter(b=>b.requester?.id===p.user.id||b.requesterEmail===p.user.email||b.resource?.owner?.id===p.user.id):[];
  const submit=async e=>{e.preventDefault();if(!bookingId||!description.trim())return;const ok=await p.doAction(()=>api('/bookings/'+bookingId+'/incidents',{method:'POST',body:JSON.stringify({type,description:description.trim()})}),'Incident submitted for review.');if(ok){setBookingId('');setType('OTHER');setDescription('');}};
  return <>
    <PageHead eyebrow="SAFETY & CARE" title="Incident reports" description="Report damage, delays, or another concern related to a booking."/>
    {p.dataErrors.bookings&&<LoadMessage message={p.dataErrors.bookings}/>}
    <form className="panel incident-form" onSubmit={submit}><h2>Report an incident</h2><p>Reports are attached to one of your bookings and sent to the API.</p>
      <label>Related booking<select required value={bookingId} onChange={e=>setBookingId(e.target.value)}><option value="">Select a booking</option>{allowed.map(b=><option key={b.id} value={b.id}>#{b.id} · {b.resourceName||b.resource?.name||'Resource'} · {b.status}</option>)}</select></label>
      <label>Incident type<select required value={type} onChange={e=>setType(e.target.value)}><option value="DAMAGE">Damage</option><option value="DELAY">Delay</option><option value="OTHER">Other</option></select></label>
      <label>What happened?<textarea required maxLength="2000" rows="4" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe what happened factually…"/></label>
      <button className="btn btn-primary" disabled={p.busy||!bookingId||!description.trim()}><AlertTriangle size={15}/>{p.busy?'Submitting…':'Submit report'}</button>
    </form>
    <div className="panel list-panel section-gap"><div className="section-heading panel-heading"><div><h2>Reported incidents</h2><p>Reports related to your bookings.</p></div></div>
      {p.dataErrors.incidents?<LoadMessage message={p.dataErrors.incidents}/>:p.incidents.length?p.incidents.map(i=><div className="incident-row" key={i.id}><AlertTriangle/><div><b>{i.type||'Incident'}</b><small>{i.description}</small>{i.resolutionNote&&<small>Resolution: {i.resolutionNote}</small>}</div><Status status={i.status}/></div>):<Empty icon={<ShieldCheck/>} title="No incidents to show" body="There are no incident reports available for this account."/>}
    </div>
  </>;
}
function History(p) {
  const navigate=useNavigate();
  return <><PageHead eyebrow="TRANSPARENCY" title="Activity history" description="A clear record of actions across your bookings."/>
    {p.dataErrors.audit?<LoadMessage message={p.dataErrors.audit}/>:<div className="panel list-panel">{p.events.length?p.events.map(event=>{const path=event.entityType==='BOOKING'?'/bookings/'+event.entityId:event.entityType==='INCIDENT'?'/incidents':null;const content=<><span className="history-icon"><Activity size={16}/></span><span className="history-copy"><b>{(event.action||'Activity').replaceAll('_',' ').toLowerCase()}</b><small>{event.entityType} #{event.entityId}{event.reason?' · '+event.reason:''}</small></span><time>{event.timestamp?new Date(event.timestamp).toLocaleString():''}</time></>;return path?<button className="history-row history-button" key={event.id} onClick={()=>navigate(path)}>{content}</button>:<div className="history-row" key={event.id}>{content}</div>; }):<Empty icon={<Activity/>} title="No activity to show" body="There are no audit events available for this account."/>}</div>}
  </>;
}
function HelpPage() {
  useEffect(()=>{if(window.location.hash)document.getElementById(window.location.hash.slice(1))?.scrollIntoView({block:'start'});},[]);
  const topics=[    ['Discovering resources','Search published listings, filter by category or location, and open a listing for its location, usage guidance, training requirements, and booking duration.'],
    ['Publishing a resource','Provide the name, category, location, description, and maximum duration. The API permits creation only for an authorized owner or administrator. You will see success only after the server accepts the listing.'],
    ['Requesting and managing bookings','Choose future start and end times within the listing duration and explain your purpose. The API enforces overlap, eligibility, approval, and fair-use limits. Rejections and conflicts appear as request errors.'],
    ['Owner approvals','Owners can approve or reject pending requests for their own resources. Each decision requires a reason. Availability is rechecked by the backend when approving.'],
    ['Check-in and return','An approved booking requires a BEFORE condition report before check-in. A CHECKED_OUT booking requires an AFTER report before return submission. The resource owner confirms the return.'],
    ['Reporting incidents','Submit a damage, delay, or other incident from a related booking. The API records the report. Owners or administrators may resolve it with a resolution note.'],
    ['Booking statuses','PENDING awaits an owner decision; APPROVED is reserved; REJECTED was declined; WAITLISTED awaits an opening; CHECKED_OUT is in use; RETURN_PENDING_CONFIRMATION awaits owner confirmation; COMPLETED is returned; CANCELLED was withdrawn; OVERDUE is late.']
  ];
  return <><PageHead eyebrow="SHARESPACE GUIDE" title="Help centre" description="How to find, share, and care for campus resources."/><div className="help-content">{topics.map(([title,content],i)=><section className="panel help-topic" id={i===4?'guidelines':undefined} key={title}><span className="help-step">{String(i+1).padStart(2,'0')}</span><div><h2>{title}</h2><p>{content}</p></div></section>)}</div><NavLink className="btn btn-outline" to="/discover"><Search size={16}/>Explore resources</NavLink></>;
}
function SettingsPage(p) {
  const firebaseUser=p.session.user;
  const profileName=p.user?.fullName||firebaseUser?.displayName;
  const profileEmail=p.user?.email||firebaseUser?.email;
  const providerNames=firebaseUser?.providerData?.map(provider=>provider.providerId.replace('.com','')).join(', ');
  return <><PageHead eyebrow="ACCOUNT" title="Account information" description="Details provided by your signed-in account and ShareSpace profile."/>
    <section className="panel settings-panel account-details-panel"><div className="account-details-heading"><span className="settings-avatar">{firebaseUser?.photoURL?<img src={firebaseUser.photoURL} alt=""/>:profileName?profileName.split(' ').map(part=>part[0]).join('').slice(0,2):profileEmail?.slice(0,1).toUpperCase()}</span><div><h2>{profileName||profileEmail||'Signed-in account'}</h2><p>{profileEmail||'No email address is available from Firebase.'}</p></div></div>
      <dl><div><dt>Authentication</dt><dd>Firebase{providerNames?` · ${providerNames}`:''}</dd></div><div><dt>Email status</dt><dd>{firebaseUser?.emailVerified?'Verified':'Not verified'}</dd></div><div><dt>ShareSpace role</dt><dd>{p.user?.role||'Unavailable'}</dd></div><div><dt>Membership</dt><dd>{p.user?.membershipStatus||'Unavailable'}</dd></div></dl>
      {!p.user&&<p className="settings-note" role="status">Firebase account details are available. ShareSpace role and membership details could not be loaded from the backend{p.dataErrors.user?`: ${p.dataErrors.user}`:'.'}</p>}
      <p className="settings-note">Profile editing and notification preferences are not supported by the current API. Use the settings menu for appearance, password reset, help, and sign out.</p>
    </section>
    <NavLink className="btn btn-outline settings-back" to="/"><ArrowRight size={16}/>Return to overview</NavLink>
  </>;
}
function NotFound() { const navigate=useNavigate(); return <Empty icon={<Search/>} title="Page not found" body="That ShareSpace page does not exist." action="Return to overview" onClick={()=>navigate('/')}/>; }
function Empty({icon,title,body,action,onClick}) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{body}</p>{action&&<button className="btn btn-outline" onClick={onClick}>{action}<ArrowRight size={14}/></button>}</div>; }
export default App;
