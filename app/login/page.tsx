import { signIn, signUp } from "@/app/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">IS</span>
          <span>Invoice Studio</span>
        </div>
        <p className="eyebrow">Welcome</p>
        <h1 id="auth-title">Sign in to your invoices</h1>
        <p className="auth-intro">Use your account to access profiles, clients, and saved invoices.</p>
        <form className="auth-form">
          <label>
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" minLength={8} required />
          </label>
          {error && <p className="auth-message error" role="alert">{error}</p>}
          {message && <p className="auth-message" role="status">{message}</p>}
          <div className="auth-actions">
            <button className="button primary" formAction={signIn}>Sign in</button>
            <button className="button secondary" formAction={signUp}>Create account</button>
          </div>
        </form>
      </section>
    </main>
  );
}
