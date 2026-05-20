const base = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f9fafb;
  margin: 0; padding: 0;
`;

const card = `
  max-width: 480px; margin: 40px auto;
  background: #fff; border-radius: 12px;
  padding: 40px; border: 1px solid #e5e7eb;
`;

const btn = `
  display: inline-block; background: #111827;
  color: #fff; padding: 12px 24px; border-radius: 8px;
  text-decoration: none; font-weight: 600; font-size: 14px; margin: 24px 0;
`;

const footer = `margin-top: 32px; font-size: 12px; color: #9ca3af; line-height: 1.6;`;

export const verificationEmailTemplate = (url: string): string => `
<!DOCTYPE html><html lang="en"><body style="${base}">
  <div style="${card}">
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;">Verify your email</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 4px;">
      Welcome to Interview Khichuri. Verify your email address to activate your account.
    </p>
    <a href="${url}" style="${btn}">Verify Email</a>
    <p style="color:#9ca3af;font-size:13px;">
      Or copy this link:<br/>
      <span style="color:#6b7280;word-break:break-all;">${url}</span>
    </p>
    <div style="${footer}">Link expires in 24 hours. Ignore this if you didn't register.</div>
  </div>
</body></html>
`;

export const passwordResetEmailTemplate = (url: string): string => `
  <!DOCTYPE html><html lang="en"><body style="${base}">
    <div style="${card}">
      <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;">Reset your password</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 4px;">
        We received a request to reset your Interview Khichuri password.
      </p>
      <a href="${url}" style="${btn}">Reset Password</a>
      <p style="color:#9ca3af;font-size:13px;">
        Or copy this link:<br/>
        <span style="color:#6b7280;word-break:break-all;">${url}</span>
      </p>
      <div style="${footer}">Link expires in 1 hour. Ignore this if you didn't request a reset.</div>
    </div>
  </body></html>
  `;

export const changeEmailTemplate = (url: string): string => `
<!DOCTYPE html><html lang="en"><body style="${base}">
  <div style="${card}">
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;">Confirm your new email</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 4px;">
      You requested to change your email address for Interview Khichuri. Click below to confirm this change.
    </p>
    <a href="${url}" style="${btn}">Confirm Email</a>
    <p style="color:#9ca3af;font-size:13px;">
      Or copy this link:<br/>
      <span style="color:#6b7280;word-break:break-all;">${url}</span>
    </p>
    <div style="${footer}">Link expires in 1 hour. Ignore this if you didn't request this change.</div>
  </div>
</body></html>
`;

export const deleteAccountTemplate = (url: string): string => `
<!DOCTYPE html><html lang="en"><body style="${base}">
  <div style="${card}">
    <h1 style="font-size:24px;font-weight:700;color:#111827;margin:0 0 8px;">Delete your account</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0 0 4px;">
      We received a request to permanently delete your Interview Khichuri account and all associated data. This action cannot be undone.
    </p>
    <a href="${url}" style="${btn}">Delete Account</a>
    <p style="color:#9ca3af;font-size:13px;">
      Or copy this link:<br/>
      <span style="color:#6b7280;word-break:break-all;">${url}</span>
    </p>
    <div style="${footer}">Link expires in 1 hour. Ignore this if you didn't request deletion.</div>
  </div>
</body></html>
`;
