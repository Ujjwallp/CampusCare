# Free photo & video storage (Cloudinary)

Firebase Storage now needs a billing account, so CampusCare stores photos and
videos on **Cloudinary** instead — the free plan needs **no credit card**, works
straight from the browser (no server), and handles **video as well as images**.

Without this, photos still work (they're compressed and stored inside Firestore
for free); only video needs Cloudinary.

## One-time setup (about 2 minutes)

1. Go to **https://cloudinary.com** and create a free account.
2. On the dashboard, copy your **Cloud name** (a short word, e.g. `dxab12cd`).
3. Create an **unsigned upload preset** so the browser can upload without a secret key:
   - Go to **Settings → Upload → Upload presets → Add upload preset**.
   - Set **Signing Mode** to **Unsigned**.
   - (Optional) set the folder to `campuscare`.
   - **Save**, and copy the **preset name** (e.g. `campuscare_unsigned`).
4. Open **`js/backend/core/config.js`** and fill in the two values:

   ```js
   export const CLOUDINARY_CLOUD_NAME   = 'dxab12cd';            // your cloud name
   export const CLOUDINARY_UPLOAD_PRESET = 'campuscare_unsigned'; // your preset name
   ```

5. Save and hard-refresh the app. Photo **and** video attachments now upload to
   Cloudinary and show inline in tickets and chats.

## Good to know

- **Free limits:** ~25 credits/month (1 credit ≈ 1 GB storage or 1,000 image
  transforms), 3 users — plenty for a campus project.
- **Size caps in the app:** 15 MB per image, 100 MB per video (adjust in
  `js/backend/services/fileService.js`).
- **Security:** an unsigned preset lets anyone with the preset name upload to
  your Cloudinary account. That's normal for client-side uploads; keep the
  preset limited (images/video only) and, if you like, set a max file size in
  the preset. Never put your Cloudinary **API secret** in the app — it isn't
  needed for unsigned uploads.
- **Alternatives:** Supabase Storage (1 GB free) or ImageKit also work if you
  prefer; they'd need their own small integration in `fileService.js`.
