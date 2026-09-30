import { Link } from 'react-router-dom';
import { Logo } from '../components/layout/Sidebar';

/** Public privacy policy (required by Google OAuth to publish the app). */
export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-ink">
      <Link to="/login">
        <Logo />
      </Link>
      <h1 className="mb-1 mt-8 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-muted">ReachInbox Scheduler — a demo project built for a hiring assignment.</p>

      <h2 className="mb-2 mt-6 font-semibold">What we collect</h2>
      <p>
        When you sign in with Google we receive your name, email address and profile picture. We store these to
        identify your account and show them in the dashboard. We do not access your Gmail, contacts or any other
        Google data.
      </p>

      <h2 className="mb-2 mt-6 font-semibold">Emails you schedule</h2>
      <p>
        Subjects, bodies and recipient addresses you enter are stored so they can be sent at the scheduled time.
        Emails are delivered through Ethereal, a fake SMTP test service — they never reach real inboxes.
      </p>

      <h2 className="mb-2 mt-6 font-semibold">Slack</h2>
      <p>
        If you connect Slack, we store the webhook for the channel you choose and only use it to post rate-limit
        notifications. You can disconnect at any time from the dashboard.
      </p>

      <h2 className="mb-2 mt-6 font-semibold">Sharing &amp; deletion</h2>
      <p>
        Your data is never sold or shared with third parties. This is a demo environment and data may be wiped at
        any time. To have your data deleted sooner, contact the app owner.
      </p>
    </div>
  );
}
