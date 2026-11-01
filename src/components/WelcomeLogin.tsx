import { useState } from 'react'
import {
  ArrowRight, CheckCircle2, Cloud, Database, ExternalLink,
  KeyRound, Loader2, Lock, LogIn, Mail, ShieldCheck, Sparkles, User, UserPlus, Wallet, X,
} from 'lucide-react'
import { getStoredClientId, requestGoogleLogin, setStoredClientId } from '../lib/driveSync'
import { getStoredAccounts, isDeveloperAccount, upsertAccount } from '../lib/accounts'
import type { UserAccount, UserSession } from '../types'

export type { UserSession }

interface WelcomeLoginProps {
  onLogin: (session: UserSession) => void
  onToast: (msg: string) => void
  onClose?: () => void
  initialMode?: 'login' | 'signup'
}

export default function WelcomeLogin({
  onLogin,
  onToast,
  onClose,
  initialMode = 'login',
}: WelcomeLoginProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(initialMode)
  const [activeTab, setActiveTab] = useState<'options' | 'clientIdSetup'>('options')

  // Sign Up form states
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupStorage, setSignupStorage] = useState<'local' | 'google'>('local')

  // Local login state
  const [localName, setLocalName] = useState(() => {
    return (typeof window !== 'undefined' && window.localStorage.getItem('spendwise.user_name')) || ''
  })

  const [savedAccounts] = useState<UserAccount[]>(() => getStoredAccounts())
  const [clientId, setClientId] = useState(() => getStoredClientId())
  const [clientIdDraft, setClientIdDraft] = useState(() => getStoredClientId())
  const isDev = isDeveloperAccount()
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false)

  const handleContinueLocal = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const name = localName.trim() || 'Alex'
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('spendwise.user_name', name)
    }

    const account = upsertAccount({
      id: `local-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      mode: 'local',
      createdAt: new Date().toISOString(),
    })

    onLogin({
      mode: 'local',
      name: account.name,
      email: account.email,
      accountId: account.id,
    })
    onToast(`Welcome back, ${account.name}!`)
    onClose?.()
  }

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = signupName.trim()
    if (!name) {
      onToast('Please enter your name')
      return
    }

    if (signupStorage === 'google') {
      handleGoogleSignIn()
      return
    }

    const account = upsertAccount({
      id: `local-${Date.now()}`,
      name,
      email: signupEmail.trim() || undefined,
      mode: 'local',
      createdAt: new Date().toISOString(),
    })

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('spendwise.user_name', account.name)
    }

    onLogin({
      mode: 'local',
      name: account.name,
      email: account.email,
      accountId: account.id,
    })
    onToast(`Account created for ${account.name}!`)
    onClose?.()
  }

  const handleSwitchToSaved = (acc: UserAccount) => {
    upsertAccount(acc)
    onLogin({
      mode: acc.mode,
      name: acc.name,
      email: acc.email,
      picture: acc.picture,
      accountId: acc.id,
    })
    onToast(`Switched to ${acc.name}`)
    onClose?.()
  }

  const handleContinueDemo = () => {
    onLogin({
      mode: 'demo',
      name: 'Guest User',
    })
    onToast('Exploring Spendwise with sample data.')
    onClose?.()
  }

  const handleGoogleSignIn = async () => {
    if (!clientId.trim()) {
      setActiveTab('clientIdSetup')
      onToast('Please enter your Google Cloud OAuth Client ID first')
      return
    }

    setIsSigningInGoogle(true)
    try {
      const res = await requestGoogleLogin(clientId)
      const name = res.user.name || 'Google User'
      const account = upsertAccount({
        id: `google-${res.user.email.toLowerCase()}`,
        name,
        email: res.user.email,
        picture: res.user.picture,
        mode: 'google',
        createdAt: new Date().toISOString(),
      })

      onLogin({
        mode: 'google',
        name: account.name,
        email: account.email,
        picture: account.picture,
        accountId: account.id,
      })
      onToast(`Signed in as ${res.user.email}!`)
      onClose?.()
    } catch (err) {
      console.error('Google login error:', err)
      onToast(`Login failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSigningInGoogle(false)
    }
  }

  const handleSaveClientId = (e: React.FormEvent) => {
    e.preventDefault()
    setStoredClientId(clientIdDraft)
    setClientId(clientIdDraft.trim())
    setActiveTab('options')
    onToast(clientIdDraft.trim() ? 'Google Client ID saved' : 'Google Client ID cleared')
  }

  const isModal = Boolean(onClose)

  return (
    <div className={`welcome-page ${isModal ? 'welcome-modal-mode' : ''}`}>
      {!isModal && <div className="welcome-backdrop-glow" />}

      <header className="welcome-header">
        <div className="welcome-brand">
          <img src="/logo.svg" alt="Spendwise logo" className="welcome-logo" />
          <span className="brand-name">spendwise<span className="brand-period">.</span></span>
        </div>
        <div className="welcome-header-badges">
          <span className="welcome-pill"><ShieldCheck size={13} /> 100% Private</span>
          <span className="welcome-pill"><Database size={13} /> Zero Cloud Database</span>
          <span className="welcome-pill free-pill"><Sparkles size={13} /> Free Forever</span>
        </div>
        {onClose && (
          <button type="button" className="icon-button modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        )}
      </header>

      <main className="welcome-container">
        {!isModal && (
          <div className="welcome-hero">
            <div className="welcome-hero-kicker">
              <span className="kicker-dot" /> MODERN PERSONAL FINANCE
            </div>
            <h1 className="welcome-title">
              Take total control of your money, <span className="title-highlight">privately.</span>
            </h1>
            <p className="welcome-subtitle">
              Parse multi-bank statements (PDF, Excel, CSV), auto-detect self-transfers, customize categories, and sync across PC and phone.
            </p>
          </div>
        )}

        <div className="welcome-auth-card">
          {/* Top Auth Tabs: Log In vs Sign Up */}
          <div className="auth-tab-bar">
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setActiveTab('options') }}
            >
              <LogIn size={15} />
              <span>Log In</span>
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => { setAuthMode('signup'); setActiveTab('options') }}
            >
              <UserPlus size={15} />
              <span>Create Account (Sign Up)</span>
            </button>
          </div>

          {activeTab === 'options' ? (
            authMode === 'login' ? (
              <div className="welcome-auth-content">
                <h2 className="auth-card-heading">Welcome back to Spendwise</h2>
                <p className="auth-card-sub">Choose your preferred sign-in method to access your statements.</p>

                {/* Saved Profiles (if any) */}
                {savedAccounts.length > 0 && (
                  <div className="saved-accounts-section">
                    <span className="saved-accounts-label">Saved on this device</span>
                    <div className="saved-accounts-grid">
                      {savedAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          className="saved-account-card"
                          onClick={() => handleSwitchToSaved(acc)}
                        >
                          <div className="saved-acc-avatar">
                            {acc.picture ? (
                              <img src={acc.picture} alt="" />
                            ) : (
                              acc.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="saved-acc-meta">
                            <strong>{acc.name}</strong>
                            <span>{acc.mode === 'google' ? acc.email || 'Google Account' : 'Local Offline Workspace'}</span>
                          </div>
                          <ArrowRight size={14} className="saved-acc-arrow" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Option 1: Google Sign In */}
                <div className="auth-method-card google-method">
                  <div className="method-header">
                    <div className="method-icon-wrap google-icon-wrap">
                      <Cloud size={20} />
                    </div>
                    <div className="method-copy">
                      <div className="method-badge-row">
                        <strong>Sign in with Google Drive</strong>
                        <span className="tag-recommended">Sync PC & Phone</span>
                      </div>
                      <p>Sync encrypted statements across devices via Google Drive.</p>
                    </div>
                  </div>

                  <div className="method-actions">
                    <button
                      type="button"
                      className="button button-primary button-google-login"
                      onClick={handleGoogleSignIn}
                      disabled={isSigningInGoogle}
                    >
                      {isSigningInGoogle ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" />
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.94H1.27v3.15C3.25 21.36 7.35 24 12 24z" />
                          <path fill="#FBBC05" d="M5.28 14.26c-.25-.72-.38-1.49-.38-2.26s.13-1.54.38-2.26V6.59H1.27C.46 8.21 0 10.05 0 12s.46 3.79 1.27 5.41l4.01-3.15z" />
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.25 2.64 1.27 6.59l4.01 3.15c.95-2.84 3.6-4.99 6.72-4.99z" />
                        </svg>
                      )}
                      <span>{isSigningInGoogle ? 'Connecting to Drive...' : 'Log in with Google'}</span>
                    </button>

                    {(isDev || !clientId) && (
                      <button
                        type="button"
                        className="button-link-config"
                        onClick={() => setActiveTab('clientIdSetup')}
                      >
                        <KeyRound size={13} /> {clientId ? 'Configure Client ID' : 'Set OAuth Client ID'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Option 2: Local Workspace Sign In */}
                <div className="auth-method-card local-method">
                  <div className="method-header">
                    <div className="method-icon-wrap local-icon-wrap">
                      <Database size={20} />
                    </div>
                    <div className="method-copy">
                      <div className="method-badge-row">
                        <strong>Log in to Local Workspace</strong>
                        <span className="tag-local">Offline Mode</span>
                      </div>
                      <p>Stored locally in your browser with zero network requests.</p>
                    </div>
                  </div>

                  <form onSubmit={handleContinueLocal} className="local-signin-form">
                    <div className="local-name-input-row">
                      <div className="input-with-icon">
                        <User size={15} />
                        <input
                          type="text"
                          className="input"
                          placeholder="Enter your name (e.g. Alex)"
                          value={localName}
                          onChange={(e) => setLocalName(e.target.value)}
                        />
                      </div>
                      <button type="submit" className="button button-secondary">
                        <span>Open Workspace</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>
                </div>

                {/* Option 3: Explore Sample Demo */}
                <div className="demo-signin-row">
                  <span>Want to test before importing?</span>
                  <button
                    type="button"
                    className="demo-link-button"
                    onClick={handleContinueDemo}
                  >
                    <Sparkles size={13} /> Explore Sample Demo
                  </button>
                </div>
              </div>
            ) : (
              /* Sign Up / Create Account View */
              <div className="welcome-auth-content">
                <h2 className="auth-card-heading">Create your Spendwise Account</h2>
                <p className="auth-card-sub">Set up your private personal finance workspace in 10 seconds.</p>

                <form onSubmit={handleSignupSubmit} className="signup-full-form">
                  <div className="form-group">
                    <label htmlFor="signup-name">
                      <strong>Your Name</strong>
                      <span>How you’d like Spendwise to address you</span>
                    </label>
                    <div className="input-with-icon">
                      <User size={15} />
                      <input
                        id="signup-name"
                        type="text"
                        className="input"
                        placeholder="e.g. Alex Morgan"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="signup-email">
                      <strong>Email Address (Optional)</strong>
                      <span>Used for account identity and optional backup labels</span>
                    </label>
                    <div className="input-with-icon">
                      <Mail size={15} />
                      <input
                        id="signup-email"
                        type="email"
                        className="input"
                        placeholder="e.g. alex@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>
                      <strong>Storage & Sync Preference</strong>
                      <span>Where should your transaction data be preserved?</span>
                    </label>
                    <div className="storage-choice-grid">
                      <label className={`storage-choice-card ${signupStorage === 'local' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="storage-choice"
                          checked={signupStorage === 'local'}
                          onChange={() => setSignupStorage('local')}
                        />
                        <div className="choice-text">
                          <strong><Database size={15} /> Local On-Device (IndexedDB)</strong>
                          <p>Stored strictly on your computer's hard drive. Fast and completely offline.</p>
                        </div>
                      </label>

                      <label className={`storage-choice-card ${signupStorage === 'google' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="storage-choice"
                          checked={signupStorage === 'google'}
                          onChange={() => setSignupStorage('google')}
                        />
                        <div className="choice-text">
                          <strong><Cloud size={15} /> Google Drive Cloud Sync</strong>
                          <p>Syncs to your personal Google Drive appData so you can use on both PC and phone.</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="signup-submit-row">
                    <button type="submit" className="button button-primary button-large">
                      <span>Create Account & Start</span>
                      <ArrowRight size={15} />
                    </button>
                    <span className="privacy-badge-note">
                      <ShieldCheck size={13} /> Stored on your device · No bank credentials needed
                    </span>
                  </div>
                </form>
              </div>
            )
          ) : (
            /* Google Client ID Configuration Screen */
            <div className="welcome-client-config">
              <div className="config-header">
                <button
                  type="button"
                  className="config-back-button"
                  onClick={() => setActiveTab('options')}
                >
                  ← Back to sign-in options
                </button>
                <h3>Google Cloud OAuth Client ID</h3>
                <p>Spendwise uses Google Identity Services to sync files to your private Google Drive appData.</p>
              </div>

              <form onSubmit={handleSaveClientId} className="config-form">
                <label htmlFor="welcome-client-id">
                  <strong>OAuth 2.0 Client ID</strong>
                  <span>From your free Google Cloud Console project:</span>
                </label>
                <div className="config-input-row">
                  <input
                    id="welcome-client-id"
                    type="text"
                    className="input"
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    value={clientIdDraft}
                    onChange={(e) => setClientIdDraft(e.target.value)}
                  />
                  <button type="submit" className="button button-primary">Save & Return</button>
                </div>
              </form>

              <div className="config-guide-box">
                <strong>How to get a Client ID (takes 2 minutes):</strong>
                <ol>
                  <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console <ExternalLink size={12} /></a> and create a project.</li>
                  <li>Click <em>Create Credentials → OAuth client ID</em>.</li>
                  <li>Choose <strong>Web application</strong> and add <code>http://localhost:3000</code> to <strong>Authorized JavaScript origins</strong>.</li>
                  <li>Enable the <strong>Google Drive API</strong> in <em>APIs & Services</em>.</li>
                  <li>Paste the Client ID here!</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Feature Highlights Grid (on full screen mode) */}
        {!isModal && (
          <div className="welcome-features-grid">
            <div className="feature-item">
              <div className="feature-icon"><Wallet size={18} /></div>
              <strong>Multi-Bank Parser</strong>
              <p>Upload text PDFs, Excel (.xlsx), and CSV statements from KVB, HDFC, SBI, and more.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><ArrowRight size={18} /></div>
              <strong>Self-Transfer Detection</strong>
              <p>Automatically pairs debit/credit legs across your accounts so income and expenses aren’t doubled.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><CheckCircle2 size={18} /></div>
              <strong>Batch Category Grid</strong>
              <p>Shift-click multiple rows and re-categorize dozens of transactions in one second.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><Lock size={18} /></div>
              <strong>Private & Permanent</strong>
              <p>Everything lives in IndexedDB on your device or in your personal Google Drive.</p>
            </div>
          </div>
        )}
      </main>

      {!isModal && (
        <footer className="welcome-footer">
          <span>Spendwise · Local-first, private personal finance workspace</span>
        </footer>
      )}
    </div>
  )
}
