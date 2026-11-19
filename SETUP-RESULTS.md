# Turning on anonymous results (about 10 minutes)

Until these steps are done, result sharing stays **off**: students never see the
sharing prompt, nothing is sent, and the site works exactly as before.

What gets collected once it's on (only from students who tap **Share anonymously**):
which game, quiz answers before and after, survey ratings, optional comment,
and the date. Never names, emails, real budgets or anything typed into the calculators.

## 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** → name it `slugonomics` (Google Analytics: off).
2. **Build → Firestore Database → Create database** → *Production mode* → location `us-west2` (Los Angeles).
3. **Build → Authentication → Get started → Email/Password → Enable**.
4. **Authentication → Users → Add user**: your own email + a strong password. This is the only account that can read results.

## 2. Publish the security rules
1. Open `firestore.rules` from this repo and replace `OWNER_EMAIL` with the email from step 1.4.
2. Firebase console → **Firestore → Rules** → paste the whole file → **Publish**.

These rules let anyone *add* a well-formed result but never read, change or delete one.
Only your account can read.

## 3. Connect the site
1. Firebase console → ⚙ **Project settings → General → Your apps → Web (`</>`)** → register an app.
2. Copy `apiKey` and `projectId` into `assets/config.js`:
   ```js
   firebaseApiKey: "AIza...",
   firebaseProjectId: "slugonomics-xxxx",
   ```
   (A Firebase web API key is meant to be public; the rules above are what protect the data.)
3. **Authentication → Settings → Authorized domains** → add `sunny10211.github.io`.

## 4. Page counts (optional, 2 minutes)
1. Sign up at <https://www.goatcounter.com> (free for non-commercial sites, no cookies, no personal data).
2. Put your site code in `assets/config.js` → `goatcounterCode: "slugonomics"`.

## 5. Check it
- Open the site, play a game, finish the first quiz → the sharing prompt appears → **Share anonymously**.
- Open `results.html` on the site, sign in with your owner account → your row shows up.
- `results.html?demo` previews the page with sample data any time.
- Students can switch sharing on or off from the site footer.
