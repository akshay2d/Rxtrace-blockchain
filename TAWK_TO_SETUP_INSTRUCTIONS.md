# Tawk.to Chat Widget Setup Instructions

**Date:** 2025-01-20  
**Status:** ✅ Integration code updated

---

## 📋 **WHAT YOU NEED**

To enable Tawk.to chat widget, you need:

1. **Tawk.to Account** (free at https://www.tawk.to)
2. **Property ID** (also called Site ID)
3. **Widget ID** (optional, but recommended)

---

## 🔧 **SETUP STEPS**

### **Step 1: Create Tawk.to Account**

1. Go to https://www.tawk.to
2. Sign up for a free account
3. Verify your email

### **Step 2: Create a Property**

1. Log in to Tawk.to dashboard
2. Click "Add Property" or "Create Property"
3. Enter your website details:
   - Website name: RxTrace
   - Website URL: Your production URL
4. Click "Create Property"

### **Step 3: Get Your Widget Code**

1. In Tawk.to dashboard, go to **Administration** → **Channels** → **Chat Widget**
2. You'll see an embed code that looks like this:

```html
<!--Start of Tawk.to Script-->
<script type="text/javascript">
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/YOUR_PROPERTY_ID/YOUR_WIDGET_ID';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
</script>
<!--End of Tawk.to Script-->
```

3. From this code, extract:
   - **Property ID**: The first ID in the URL (e.g., `1234567890abcdef12345678`)
   - **Widget ID**: The second ID in the URL (e.g., `1abcdefg`)

### **Step 4: Configure Environment Variables**

Add these to your Vercel environment variables (or `.env.local` for local development):

```bash
NEXT_PUBLIC_TAWK_TO_PROPERTY_ID=your_property_id_here
NEXT_PUBLIC_TAWK_TO_WIDGET_ID=your_widget_id_here
```

**Example:**
```bash
NEXT_PUBLIC_TAWK_TO_PROPERTY_ID=1234567890abcdef12345678
NEXT_PUBLIC_TAWK_TO_WIDGET_ID=1abcdefg
```

### **Step 5: Deploy**

1. Add environment variables in Vercel dashboard:
   - Go to your project → Settings → Environment Variables
   - Add `NEXT_PUBLIC_TAWK_TO_PROPERTY_ID`
   - Add `NEXT_PUBLIC_TAWK_TO_WIDGET_ID`
   - Redeploy your application

2. The chat widget will automatically appear on the Help & Support page

---

## ✅ **VERIFICATION**

After deployment:

1. Navigate to `/dashboard/help`
2. Click on the "Live Chat" tab
3. Look for the chat widget in the bottom-right corner
4. Test by sending a message

---

## 🔒 **SECURITY NOTES**

- Tawk.to script loads only on the Help & Support page (as per requirements)
- Script is loaded client-side only
- No sensitive data is passed to Tawk.to
- Widget respects user privacy settings

---

## 📝 **CUSTOMIZATION**

You can customize the chat widget appearance in Tawk.to dashboard:

1. Go to **Administration** → **Channels** → **Chat Widget**
2. Click **"Customize Widget"**
3. Adjust:
   - Widget position
   - Colors and branding
   - Welcome message
   - Operating hours
   - Departments

---

## 🆘 **TROUBLESHOOTING**

### **Widget Not Appearing**

1. Check browser console for errors
2. Verify environment variables are set correctly
3. Ensure Property ID and Widget ID are correct
4. Check if ad blockers are blocking the script
5. Verify the script is loading: Check Network tab for `embed.tawk.to` requests

### **Script Already Loaded Warning**

- This is normal if the page is refreshed
- The component handles this gracefully

---

## 📄 **FILES MODIFIED**

- `app/dashboard/help/page.tsx` - Replaced Zoho SalesIQ with Tawk.to widget

---

**END OF INSTRUCTIONS**
