export default function Splash({ onStart }: { onStart: () => void }) {
  return (
    <div className="splash">
      <img className="splash-logo" src="/assets/brianna-logo.png" alt="Brianna Microfinance logo" />
      <p className="splash-company">BRIANNA MICROFINANCE LIMITED</p>
      <h1 className="splash-title">LOAN MANAGEMENT SYSTEM</h1>
      <p className="splash-line">Tunarudisha Tabasamu</p>
      <button type="button" className="btn btn-primary btn-big" onClick={onStart}>
        Get started
      </button>
      <p className="splash-foot">Secure · Reliable · Trusted</p>
    </div>
  );
}
