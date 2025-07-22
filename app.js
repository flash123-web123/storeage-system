const express      = require('express');
const fileUpload   = require('express-fileupload');
const fs           = require('fs');
const path         = require('path');
const PDFDocument  = require('pdfkit');
// const macaddress = require('macaddress');
const config = require('./config.json');


const app  = express();
const PORT = 3000;

// إعداد المجلدات والملفات
const dataDir      = path.join(__dirname, 'data');
const productsFile = path.join(dataDir, 'products.json');
const salesFile    = path.join(dataDir, 'sales.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(productsFile)) fs.writeFileSync(productsFile, '[]');
if (!fs.existsSync(salesFile))    fs.writeFileSync(salesFile,    '[]');

function loadProducts() { return JSON.parse(fs.readFileSync(productsFile)); }
function saveProducts(d) { fs.writeFileSync(productsFile, JSON.stringify(d, null, 2)); }
function loadSales()    { return JSON.parse(fs.readFileSync(salesFile)); }
function saveSales(d)    { fs.writeFileSync(salesFile,    JSON.stringify(d, null, 2)); }

function generateId() { return Date.now().toString(); }

// ضبط Express
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// البيانات المشتركة
app.locals.store = { name: app.locals.projectName, logo: app.locals.projectIMG };



const idFile = path.join(__dirname, 'data/lastId.json');

function getNextSaleId() {
  const data = JSON.parse(fs.readFileSync(idFile, 'utf8'));
  const nextId = data.lastSaleId + 1;

  // حدّث الرقم داخل الملف
  fs.writeFileSync(idFile, JSON.stringify({ lastSaleId: nextId }));

  return nextId;
}



function reverseArabic(text) {
  return text.split(' ').reverse().join(' ');
}

app.locals.projectName = config.projectName;
app.locals.projectIMG = config.projectIMG




// MAC المسموح (ثبّته انت داخل ملف أو كود)

// macaddress.one((err, mac) => {
//   if (err) {
//     console.error("لم نستطع قراءة MAC:", err);
//     process.exit(1); // ⛔ وقف التطبيق 
//     return;
//   }

//   if (mac !== config.license.mac) {
//     console.warn("⚠️ هذا الجهاز غير مرخّص لتشغيل النظام");
//     console.log("🎯 عنوان MAC الخاص بالجهاز هو:", mac);
//     console.log(config.license.mac)
//     process.exit(1); // ⛔ وقف التطبيق
//     return;
//   }

//   console.log("✅ الجهاز مصرح له بتشغيل محاسباتي");
//   // بعدها تواصل تشغيل المشروع...








// 1) شاشة الجرد والإضافة والبيع السريع
app.get('/products', (req, res) => {
  const category = req.query.category;
let products = loadProducts();
products.sort((a, b) => a.qty - b.qty);
const categories = [...new Set(products.map(p => p.category))];

if (category) {
  products = products.filter(p => p.category === category);
}

res.render('products', { products, categories, category, activePage: 'products' });

});


app.post('/products/delete/:id', (req, res) => {
  const { id } = req.params;
  const products = loadProducts();
  const filtered = products.filter(p => p.id !== id);
  saveProducts(filtered);
  res.redirect('/products');
});










app.post('/products/add', (req, res) => {
  const { name, category, priceIn, priceOut, qty, expiryDate } = req.body;
  const products = loadProducts();
  const id = generateId();
  let imgPath = '';

  if (req.files && req.files.img) {
    const file = req.files.img;
    const fileName = `${id}_${file.name}`;
    const uploadPath = path.join(__dirname, 'public', 'uploads', fileName);
    file.mv(uploadPath);
    imgPath = `/uploads/${fileName}`;
  }

    const existing = products.find(p => p.name === name && p.category === category);

    if (existing) {
      // إذا المنتج موجود، فقط زيد الكمية وحسّن السعر إن احتجت
      existing.qty += +qty;

      // إذا حدد المستخدم سعر جديد، يحدث السعر
      if (priceIn)  existing.priceIn  = +priceIn;
      if (priceOut) existing.priceOut = +priceOut;

      if (expiryDate) existing.expiryDate = expiryDate;
      if (imgPath)    existing.imgPath    = imgPath;
    } else {
      products.push({
        id, name, category,
        priceIn: +priceIn,
        priceOut: +priceOut,
        qty: +qty,
        expiryDate,
        imgPath,
        lastSold: null
      });
    }

  saveProducts(products);
  res.redirect('/products');
});

app.post('/sales/quick', (req, res) => {
  const { productId } = req.body;
  const products = loadProducts();
  const prod = products.find(p => p.id === productId);
  if (!prod) return res.status(404).send('منتج غير موجود');

  // تحديث الكمية وآخر بيع
  if (prod.qty <= 0) {
    return res.json({ success: false, message: '❌ المنتج غير متوفر حالياً' });
  }

  prod.qty -= 1;
  prod.lastSold = new Date().toISOString();

  // حذف المنتج لو وصلت الكمية صفر
  if (prod.qty === 0) {
    const index = products.findIndex(p => p.id === productId);
    products.splice(index, 1);
  }

  prod.lastSold = new Date().toISOString();
  saveProducts(products);

  // تسجيل البيع
  const sales = loadSales();
  const saleId = getNextSaleId();
  const orderNo = `${saleId}`;
  const sale = {
    id: `${saleId}`,
    date: new Date().toISOString(),
    items: [{ productId, name: prod.name, qty: 1, priceOut: prod.priceOut, priceIn: prod.priceIn }],
    paymentMethod: 'Cash',
    orderNo
  };
  sales.push(sale);
  saveSales(sales);

res.json({ success: true,
           message: '✅ تمت عملية البيع بنجاح',
           receipt: `/receipt/${saleId}` 
          });
});

// 2) توليد PDF لوصل البيع
// app.get('/receipt/:id', (req, res) => {
//   const sale = loadSales().find(s => s.id === req.params.id);
// if (!sale) {
//   res.status(404);
//   res.setHeader('Content-Type', 'text/plain');
//   return res.end('وصل غير موجود');
// }

//   const items = sale.items;

//   res.setHeader('Content-Type', 'application/pdf');
//   const doc = new PDFDocument({ margin: 40, size: 'A5' });

//   doc.registerFont('arabic', 'public/fonts/Cairo-Regular.ttf');
//   doc.font('arabic');
//   doc.pipe(res);

//   // دعم اللغة العربية (من اليمين لليسار)
//   doc.text(' ', { align: 'right' }); // trick لتفعيل RTL

//   // شعار المحل
//   doc.image('public/uploads/1752902010797_Screenshot (20).png', { width: 60, align: 'center' }).moveDown(0.5);

//   // عنوان الفاتورة
//   doc.fontSize(18).text(reverseArabic('وصل بيع رسمي'), { align: 'center' }).moveDown();

//   // معلومات الطلب
//   doc.fontSize(12);
//   doc.text(reverseArabic(`📌 رقم الطلب: ${sale.orderNo}`), { align: 'right' });
//   doc.text(reverseArabic(`📆 التاريخ: ${new Date(sale.date).toLocaleString('ar-EG')}`), { align: 'right' });
//   doc.text(reverseArabic(`💳 طريقة الدفع: ${sale.paymentMethod}`), { align: 'right' }).moveDown();

//   // المنتجات
//   let total = 0;
//   items.forEach(item => {
//     const line = `${item.name} - ${item.qty} × ${item.priceOut} = ${item.qty * item.priceOut} دينار`;
//     doc.text(line, { align: 'right' });
//     total += item.qty * item.priceOut;
//   });

//   doc.moveDown();
//   doc.fontSize(14).text(reverseArabic(`💰 المجموع الكلي: ${total.toLocaleString()} دينار`), { align: 'right' });

//   doc.moveDown(1.5);
//   doc.fontSize(10).text(reverseArabic('شكرًا لتعاملكم مع محلّي ✨'), { align: 'center' });

//   doc.end();
// });

const { createCanvas, loadImage, registerFont } = require('canvas');

// تسجيل الخط العربي (تأكد من المسار الصحيح)
registerFont('public/fonts/Cairo-Regular.ttf', { family: 'Cairo-Regular' });

app.get('/receipt/:id', async (req, res) => {
  const sale = loadSales().find(s => s.id === req.params.id);
  if (!sale) return res.status(404).send('وصل غير موجود');

  const canvas = createCanvas(500, 700); // الحجم قابل للتعديل
  const ctx = canvas.getContext('2d');

  // خلفية بيضاء
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // إعداد الخط العربي
  ctx.font = '18px Cairo-Regular';
  ctx.fillStyle = '#222';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';

  let y = 40;

  // اسم المحل
  ctx.font = '24px Cairo-Regular';
  ctx.fillText(`🛍️ ${app.locals.projectName} - وصل بيع رسمي`, canvas.width - 20, y);
  y += 30;

  // معلومات عامة
  ctx.font = '16px Cairo-Regular';
  ctx.fillText(`📌 رقم الطلب: ${sale.orderNo}`, canvas.width - 20, y); y += 25;
  ctx.fillText(`📆 التاريخ: ${new Date(sale.date).toLocaleString('ar-EG')}`, canvas.width - 20, y); y += 25;
  ctx.fillText(`💳 طريقة الدفع: ${sale.paymentMethod}`, canvas.width - 20, y); y += 40;

  let total = 0;
  ctx.font = '16px Cairo-Regular';
  ctx.fillText('🧾 تفاصيل الطلب:', canvas.width - 20, y); y += 25;

  sale.items.forEach(item => {
    const line = `${item.name} - ${item.qty} × ${item.priceOut} = ${item.qty * item.priceOut} دينار`;
    ctx.fillText(line, canvas.width - 20, y);
    total += item.qty * item.priceOut;
    y += 25;
  });

  y += 20;
  ctx.font = '18px Cairo-Regular';
  ctx.fillText(`💰 المجموع الكلي: ${total.toLocaleString()} دينار`, canvas.width - 20, y); y += 30;

  ctx.font = '14px Cairo-Regular';
  ctx.fillText('✨ شكرًا لتعاملكم معنا', canvas.width - 20, y);

  // تحويل الصورة إلى PNG
  res.setHeader('Content-Type', 'image/png');
  canvas.pngStream().pipe(res);
});

// 3) إحصائيات مع Chart.js
app.get('/stats', (req, res) => res.render('stats', {activePage: 'stats'}));
app.get('/stats-data', (req, res) => {
  const sales = loadSales(), products = loadProducts();
  const counts = {};
  sales.forEach(s => {
    s.items.forEach(it => {
      const name = it.name || 'غير معروف';
      counts[name] = (counts[name] || 0) + it.qty;
    });
  });
  res.json({ labels: Object.keys(counts), values: Object.values(counts) });
});

// 4) التنبيهات الذكية
app.get('/notifications', (req, res) => {


  const stagnantLimit = req.query.limit || 14;
  const products = loadProducts();
  const now = Date.now();
  const lowStock = products.filter(p => p.qty < 5);
  const inactive = products.filter(p => !p.lastSold || (now - new Date(p.lastSold)) > 30*24*60*60*1000);
  const expired  = products.filter(p => p.expiryDate && new Date(p.expiryDate) < now);
  res.render('notifications', {products, lowStock, inactive, expired, limitDays: parseInt(stagnantLimit), activePage: 'notification'  });
});

// 5) تقرير أسبوعي PDF
app.get('/reports/week', (req, res) => {
  const sales = loadSales();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);

  res.setHeader('Content-Type', 'application/pdf');
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.registerFont('arabic', 'public/fonts/Cairo-Regular.ttf');
  doc.font('arabic');

  doc.text(' ', { align: 'right' }); // تفعيل RTL

  doc.fontSize(18).text(reverseArabic('📊 تقرير مبيعات الأسبوع'), { align: 'center' }).moveDown();

  weekSales.forEach(s => {
    doc.fontSize(12).text(reverseArabic(`رقم الطلب: ${s.orderNo}`), { align: 'right' });
    doc.text(reverseArabic(`تاريخ: ${new Date(s.date).toLocaleString('ar-EG')}`), { align: 'right' });

    s.items.forEach(item => {
      const line = `${item.name} – ${item.qty} × ${item.priceOut} = ${item.qty * item.priceOut} دينار`;
      doc.text(reverseArabic(line), { align: 'right' });
    });

    doc.moveDown();
  });

  const totalProfit = weekSales.reduce((acc, sale) => {
    return acc + sale.items.reduce((sum, item) => sum + (item.priceOut * item.qty), 0);
  }, 0);

  doc.fontSize(14).text(`💰 إجمالي المبيعات لهذا الأسبوع: ${totalProfit.toLocaleString()} دينار`, { align: 'right' });
  doc.end();
});















app.get('/profit', (req, res) => {
  const products = loadProducts(); // جرد المنتجات
  const sales = loadSales();       // سجلات المبيعات

  // 1. إجمالي المصروف (totalBuy)
  const totalBuy = products.reduce((acc, p) => {
    return acc + (Number(p.priceIn) * Number(p.qty));
  }, 0);

  // 2. إجمالي المبيعات (totalSell)
  const totalSell = sales.reduce((acc, sale) => {
    return acc + sale.items.reduce((sum, item) => {
      return sum + (Number(item.priceOut) * Number(item.qty));
    }, 0);
  }, 0);

  // 3. الربح الصافي العام
  const profit = totalSell - totalBuy;

  // 4. حساب الربح اليومي
  const profitByDay = {};
  sales.forEach(sale => {
    const date = new Date(sale.date);
const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;

    // نجمع ربح كل بند داخل الفاتورة بشكل آمن
    const dailyProfit = sale.items.reduce((sum, item) => {
      const inP  = Number(item.priceIn)  || 0;
      const outP = Number(item.priceOut) || 0;
      const qty  = Number(item.qty)      || 0;
      return sum + (outP - inP) * qty;
    }, 0);

    if (!profitByDay[dateStr]) profitByDay[dateStr] = 0;
    profitByDay[dateStr] += dailyProfit;
  });

  // نحول الكائن لمصفوفتين للتمرير إلى الواجهة
  const profitDates  = Object.keys(profitByDay);
  const profitValues = Object.values(profitByDay);

  res.render('profit', {
    totalBuy,
    totalSell,
    profit,
    profitDates,
    profitValues,
    activePage: 'profit'
  });
});






app.get('/help', (req, res) => {
  res.render('help', { activePage: 'help' });
});


// توجيه للمنتجات كصفحة رئيسية
app.get('/', (req, res) => res.redirect('/products'));

app.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});
// });
