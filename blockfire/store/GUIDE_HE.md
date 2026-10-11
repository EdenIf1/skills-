# מדריך: מהקוד ועד App Store

## מה כבר מוכן
- אפליקציית iPhone (Capacitor) עם אייקון, מסך פתיחה, מסך מלא לרוחב, פרטיות (PrivacyInfo.xcprivacy) והצהרת הצפנה.
- עדכונים חיים: תיקונים ותוכן חדש מגיעים לשחקנים בלי לחכות לאישור של Apple.
- "עדכון נדרש" מרחוק, הודעות בבית ומתגים לפיצ'רים דרך טבלת app_config.
- מחיקת חשבון מתוך המשחק (חובה של Apple), מדיניות פרטיות, תנאי שימוש, דף תמיכה, רישיונות.
- דיווח קריסות ופניות שחקנים נשמרים בבסיס הנתונים.
- בנייה אוטומטית בענן ל-TestFlight דרך GitHub Actions, בלי Mac.
- טקסטים לחנות, תשובות לדירוג גיל ולפרטיות, ו-7 צילומי מסך בגודל הנדרש.

## מה נשאר לך לעשות
1. **חשבון Apple Developer** ($99 לשנה): developer.apple.com/programs. האישור לוקח יום עד יומיים.
2. **יצירת האפליקציה ב-App Store Connect**: Apps → + → New App. פלטפורמה iOS, שם: Blockfire: Block Shooter, Bundle ID: com.edenif1.blockfire (צריך קודם לרשום אותו ב-Certificates, Identifiers & Profiles → Identifiers), SKU: blockfire-ios-001.
3. **מפתח API**: App Store Connect → Users and Access → Integrations → App Store Connect API → צור מפתח עם הרשאת App Manager. הורד את קובץ ה-.p8 (אפשר רק פעם אחת).
4. **ארבעה סודות ב-GitHub**: github.com/EdenIf1/skills- → Settings → Secrets and variables → Actions → New repository secret:
   - `APPLE_TEAM_ID` – מזהה הצוות (Membership details)
   - `ASC_KEY_ID` – מזהה המפתח
   - `ASC_ISSUER_ID` – מופיע מעל רשימת המפתחות
   - `ASC_PRIVATE_KEY` – כל התוכן של קובץ ה-.p8
5. **בנייה**: GitHub → Actions → "iOS · TestFlight" → Run workflow (על הענף blockfire-app). אחרי בערך 20 דקות הגרסה מופיעה ב-TestFlight.
6. **בדיקה ב-TestFlight** על הטלפון שלך ושל חברים.
7. **מילוי דף החנות** מתוך store/APP_STORE_LISTING.md, העלאת צילומי המסך מ-store/screenshots, ושליחה לבדיקה (Submit for Review).

## לפני שמגישים
- להפעיל GitHub Pages כדי שלינקים של פרטיות ותמיכה יהיו קבועים (Settings → Pages → gh-pages).
- לבדוק שהשם "Blockfire" פנוי כסימן מסחרי ובחנות.
- ליצור חשבון בדיקה במשחק ולכתוב את הפרטים רק בהערות לבודק ב-App Store Connect.
- לשקול לשדרג את Supabase ל-Pro ($25 לחודש): בתוכנית החינמית הפרויקט נעצר אחרי שבוע בלי פעילות ואין גיבויים יומיים.
