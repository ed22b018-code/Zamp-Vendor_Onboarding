"""Builds VETTED's test data: 10 vendor submissions, their documents, a simulated GST registry and
simulated bank (penny-drop) records. Every document is a fictional SPECIMEN for testing only.

Run: python3 scripts/build_samples.py   (writes src/data/samples.json and public/samples/<id>/*)
"""
import json, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'samples')
C36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FM = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
random.seed(7)


def gstin(state, pan, n='1'):
    b = f'{state}{pan}{n}Z'
    t = 0
    for i, ch in enumerate(b):
        p = C36.index(ch) * (1 if i % 2 == 0 else 2)
        t += p // 36 + p % 36
    return b + C36[(36 - t % 36) % 36]


STATE_NAME = {'33': 'Tamil Nadu', '29': 'Karnataka', '27': 'Maharashtra'}

# ---------------------------------------------------------------- vendors
V = {}
V['v01'] = dict(legal='Brightline Facility Services Pvt Ltd', trade=None, btype='Private Limited', constitution='Private Limited Company', pan='AAECB4417K', st='33',
               line='14, Cathedral Road, Gopalapuram', city='Chennai', pin='600086', contact=('Anitha Raman', 'accounts@brightlinefs.in', '+91 44 2811 4417'),
               bank=('Brightline Facility Services Pvt Ltd', '50200012344417', 'HDFC0000082', 'HDFC Bank'), cat='Services', msme=True, udyam='UDYAM-TN-02-0044170',
               sponsor=('Divya N.', 'Admin'), reg='2019-04-12')
V['v02'] = dict(legal='Sundaram Packaging Solutions Pvt Ltd', trade=None, btype='Private Limited', constitution='Private Limited Company', pan='AAKCS2290M', st='33',
               line='Plot 22, SIDCO Industrial Estate, Ambattur', city='Chennai', pin='600098', contact=('V. Sundaram', 'finance@sundarampack.in', '+91 44 2625 2290'),
               bank=('Sundaram Packaging Solutions Pvt Ltd', '661205004455', 'ICIC0000001', 'ICICI Bank'), cat='Goods', msme=False, udyam=None,
               sponsor=('Ravi K.', 'Warehouse'), reg='2017-08-01', cheque_name='SUNDARAM TRADERS')
V['v03'] = dict(legal='Apex Office Systems Pvt Ltd', trade=None, btype='Private Limited', constitution='Private Limited Company', pan='AAFCA7781Q', st='33',
               line='88, Anna Salai, Teynampet', city='Chennai', pin='600018', contact=('Karthik Iyer', 'karthik@apexofficesys.in', '+91 44 2433 7781'),
               bank=('Apex Office Systems Pvt Ltd', '917020077810', 'UTIB0000006', 'Axis Bank'), cat='Goods', msme=False, udyam=None,
               sponsor=('Divya N.', 'Admin'), reg='2018-02-14', gst_pan='AAGCR5523H', gst_legal='Rathna Office Automation Pvt Ltd')
V['v04'] = dict(legal='Velan Electrical Contractors', trade=None, btype='Partnership', constitution='Partnership', pan='AAJFV3318E', st='33',
               line='5/2, Arcot Road, Vadapalani', city='Chennai', pin='600026', contact=('S. Velan', 'velanelectricals@outlook.com', '+91 98400 33180'),
               bank=('Velan Electrical Contractors', '10023318001', 'SBIN0000800', 'State Bank of India'), cat='Services', msme=True, udyam='UDYAM-TN-02-0033181',
               sponsor=('Mohan S.', 'Facilities'), reg='2016-11-20', gst_status='Cancelled', cancelled='2026-06-30')
V['v05'] = dict(legal='Shree Kaveri Traders', trade=None, btype='Proprietorship', constitution='Proprietorship', proprietor='K SENTHIL', pan='CXRPS4521L', st='33',
               line='9, Usman Road, T. Nagar', city='Chennai', pin='600017', contact=('K. Senthil', 'kaveritraders.tn@gmail.com', '+91 97890 45210'),
               bank=('Shree Kaveri Traders', '50200045214521', 'HDFC0001234', 'HDFC Bank'), cat='Goods', msme=False, udyam=None,
               sponsor=('Divya N.', 'Admin'), reg='2025-12-02')
V['v06'] = dict(legal='Nilgiri IT Services Pvt Ltd', trade=None, btype='Private Limited', constitution='Private Limited Company', pan='AAHCN8820G', st='29',
               line='3rd Floor, 41 RT Nagar Main Road', city='Bengaluru', pin='560032', contact=('Priya Menon', 'ap@nilgiriit.com', '+91 80 4123 8820'),
               bank=('Nilgiri IT Services Pvt Ltd', '50200098820123', 'HDFC0000140', 'HDFC Bank'), cat='Services', msme=False, udyam=None,
               sponsor=('Karthik S.', 'IT'), reg='2020-07-09', wrong_doc=True)
V['v07'] = dict(legal='Lakshmi Narayan Enterprises Pvt Ltd', trade='LNE Office Interiors', btype='Private Limited', constitution='Private Limited Company', pan='AADCL6620B', st='33',
               line='27, Venkatnarayana Road, T. Nagar', city='Chennai', pin='600017', contact=('Lakshmi Narayan', 'accounts@lneinteriors.in', '+91 44 2815 6620'),
               bank=('Lakshmi Narayan Enterprises Pvt Ltd', '4613066201', 'KKBK0000462', 'Kotak Mahindra Bank'), cat='Services', msme=False, udyam=None,
               sponsor=('Vikram P.', 'Store Fit-outs'), reg='2015-05-18')
V['v08'] = dict(legal='R Murugan', trade='Murugan Electricals', btype='Proprietorship', constitution='Proprietorship', proprietor='R MURUGAN', pan='BKMPM6612D', st='33',
               line='112, Mint Street, Sowcarpet', city='Chennai', pin='600079', contact=('R. Murugan', 'murugan.electricals@gmail.com', '+91 98410 66120'),
               bank=('R Murugan', '510101006612', 'CIUB0000001', 'City Union Bank'), cat='Goods', msme=True, udyam='UDYAM-TN-02-0066120',
               sponsor=('Mohan S.', 'Facilities'), reg='2012-03-05', scanned=True)
V['v09'] = dict(legal='Coromandel Logistics', trade=None, btype='Private Limited', constitution='Partnership', pan='AAMFC4471R', st='33',
               line='Door 61, Ennore High Road, Tiruvottiyur', city='Chennai', pin='600019', contact=('Faisal Ahmed', 'ops@coromandellogistics.in', '+91 44 2599 4471'),
               bank=('Coromandel Logistics', '6612044710', 'IOBA0000002', 'Indian Overseas Bank'), cat='Services', msme=False, udyam=None,
               sponsor=('Ravi K.', 'Warehouse'), reg='2014-09-30')
V['v10'] = dict(legal='Swift Supply Co', trade=None, btype='Proprietorship', constitution='Proprietorship', proprietor='ARUN KUMAR', pan='DJKPK8812F', st='33',
               line='Shop 4, 2nd Floor, Ritchie Street', city='Chennai', pin='600002', contact=('Arun Kumar', 'swiftsupplyco2026@gmail.com', '+91 90031 88120'),
               bank=('Arun Kumar', '20881200345', 'SBIN0000800', 'State Bank of India'), cat='Goods', msme=False, udyam=None,
               sponsor=None, reg='2026-10-18')

SCEN = {
  'v01': ('Smooth path', 'Clean private limited company, every document consistent, MSME certificate attached', 'approved'),
  'v02': ('Edge case', 'Bank account is not in the company\'s name: the cheque and the bank both say SUNDARAM TRADERS', 'pending'),
  'v03': ('Edge case', 'GSTIN belongs to a different business: its PAN and legal name don\'t match the vendor', 'rejected'),
  'v04': ('Edge case', 'GST registration was cancelled, though the vendor sent an old certificate', 'rejected'),
  'v05': ('Edge case', 'Bank account already belongs to an approved vendor (Kaveri Office Supplies): fraud pattern', 'rejected'),
  'v06': ('Edge case', 'Wrong document: a second PAN card uploaded where the cancelled cheque should be', 'pending'),
  'v07': ('Approved, with a twist', 'Trades under a different name (LNE Office Interiors); legal identity consistent everywhere', 'approved'),
  'v08': ('Approved, with a twist', 'Sole proprietor: bank account in the owner\'s own name, scanned documents', 'approved'),
  'v09': ('Edge case', 'Declared a private limited company, but PAN and GST say it is a partnership', 'pending'),
  'v10': ('Edge case', 'No single failure, but high risk: registered 18 days ago, Gmail address, no Northwind sponsor', 'pending'),
}
EMAIL = {
  'v01': ('Vendor registration: Brightline Facility Services', 'Hello, please find our vendor registration for housekeeping services at your Chennai HQ, with GST, PAN, cancelled cheque and Udyam certificate attached.'),
  'v02': ('New vendor form, Sundaram Packaging Solutions', 'Dear team, sharing our onboarding details and documents for corrugated boxes supply. Kindly register us.'),
  'v03': ('Registration request: Apex Office Systems', 'Please find our company details for supplying printers and consumables.'),
  'v04': ('Velan Electrical Contractors: vendor documents', 'Sir, attaching our registration papers for the electrical AMC at your stores.'),
  'v05': ('Vendor onboarding: Shree Kaveri Traders', 'Hi, we supply stationery. Please onboard us urgently, your Admin team knows us. Bank details are in the form.'),
  'v06': ('Nilgiri IT Services: onboarding pack', 'Hello, attached are our documents for the laptop support contract.'),
  'v07': ('Onboarding: LNE Office Interiors', 'Dear Northwind procurement, we are Lakshmi Narayan Enterprises, trading as LNE Office Interiors, for the new store fit-outs.'),
  'v08': ('Murugan Electricals registration', 'Sir, sending scanned copies of my documents. I am the proprietor.'),
  'v09': ('Coromandel Logistics: vendor registration', 'Please register us for warehouse transport services. Documents attached.'),
  'v10': ('Supplier registration: Swift Supply Co', 'Hi, we can supply all office items at lowest price. Please register fast so we can start this week.'),
}

# Simulated GST registry (in production: a GST Suvidha Provider API) and penny-drop results (in production: the bank's API)
REGISTRY = {}
BANK = {}
VERITY_VENDORS = [  # VERITY's approved vendor master (shared with VETTED)
  ('V-101', 'Kaveri Office Supplies Pvt Ltd', '33AABCK4521M1ZN', 'AABCK4521M', '50200045214521', 'HDFC0001234', 'HDFC Bank', '+91 44 2434 1180', 'accounts@kaverioffice.in', '22, Ranganathan Street, T. Nagar, Chennai 600017'),
  ('V-102', 'Nimbus Cloud Services Pvt Ltd', '29AACCN7781Q1ZG', 'AACCN7781Q', '000405077781', 'ICIC0000456', 'ICICI Bank', '+91 80 4718 2200', 'billing@nimbuscloud.io', 'Prestige Tech Park, Marathahalli, Bengaluru 560103'),
  ('V-103', 'Shakti Industrial Tools LLP', '27AAKFS3390B1Z7', 'AAKFS3390B', '917020043390', 'UTIB0000789', 'Axis Bank', '+91 20 2712 5590', 'ar@shaktitools.co.in', 'Plot 18, MIDC Bhosari, Pune 411026'),
  ('V-104', 'Greenleaf Facility Services Pvt Ltd', '33AADCG6612H1ZW', 'AADCG6612H', '38829106612', 'SBIN0004321', 'State Bank of India', '+91 44 4210 6612', 'accounts@greenleaffs.in', '7/3, 2nd Main Road, Adyar, Chennai 600020'),
  ('V-105', 'Orbit Electricals & Controls', '33ABJPO2205K1ZT', 'ABJPO2205K', '1187201002205', 'CNRB0001187', 'Canara Bank', '+91 98410 22050', 'orbit.elec@gmail.com', '41, Pycrofts Road, Royapettah, Chennai 600014'),
  ('V-106', 'Meridian Packaging Pvt Ltd', '24AAECM8814D1ZO', 'AAECM8814D', '4612058814', 'KKBK0000321', 'Kotak Mahindra Bank', '+91 79 2689 8814', 'finance@meridianpack.in', 'Changodar Industrial Estate, Ahmedabad 382213'),
]
for vid, name, g, pan, acct, ifsc, bank, ph, em, addr in VERITY_VENDORS:
    BANK[acct] = {'holder': name.upper(), 'ifsc': ifsc, 'status': 'Active'}

samples = []
for sid, v in V.items():
    pan_for_gst = v.get('gst_pan', v['pan'])
    g = gstin(v['st'], pan_for_gst)
    v['gstin'] = g
    legal_on_gst = v.get('gst_legal', v['legal'])
    REGISTRY[g] = {'legal_name': legal_on_gst.upper(), 'trade_name': (v['trade'] or legal_on_gst).upper(), 'constitution': v['constitution'],
                   'status': v.get('gst_status', 'Active'), 'registration_date': v['reg'], 'cancellation_date': v.get('cancelled'),
                   'state': STATE_NAME[v['st']], 'principal_place': f"{v['line']}, {v['city']} {v['pin']}"}
    holder = v.get('cheque_name') or (v.get('proprietor') or v['bank'][0]).upper()
    BANK[v['bank'][1]] = BANK.get(v['bank'][1]) or {'holder': holder, 'ifsc': v['bank'][2], 'status': 'Active'}
    docs = [{'id': 'd1', 'declared': 'gst_certificate', 'file': 'gst_certificate.pdf' if not v.get('scanned') else 'gst_certificate.jpg'},
            {'id': 'd2', 'declared': 'pan_card', 'file': 'pan_card.png' if not v.get('scanned') else 'pan_card.jpg'},
            {'id': 'd3', 'declared': 'cancelled_cheque', 'file': ('pan_card_copy.png' if v.get('wrong_doc') else 'cancelled_cheque.png') if not v.get('scanned') else 'cancelled_cheque.jpg'}]
    if v['msme']:
        docs.append({'id': 'd4', 'declared': 'msme_certificate', 'file': 'udyam_certificate.pdf'})
    for d in docs:
        d['mime'] = {'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg'}[d['file'].split('.')[-1]]
    sub = {'legal_name': v['legal'], 'trade_name': v['trade'], 'business_type': v['btype'], 'gstin': g, 'pan': v['pan'],
           'address': {'line': v['line'], 'city': v['city'], 'state': STATE_NAME[v['st']], 'pin': v['pin']},
           'contact': {'name': v['contact'][0], 'email': v['contact'][1], 'phone': v['contact'][2]},
           'bank': {'account_name': v['bank'][0], 'account_number': v['bank'][1], 'ifsc': v['bank'][2], 'bank_name': v['bank'][3]},
           'category': v['cat'], 'msme': v['msme'], 'udyam': v['udyam'],
           'sponsor': {'name': v['sponsor'][0], 'department': v['sponsor'][1]} if v['sponsor'] else None}
    # Ground truth of what each document says: used as the cached reading when live AI is unavailable.
    truth = []
    for d in docs:
        if d['file'].startswith('gst'):
            f = {'legal_name': legal_on_gst.upper(), 'trade_name': (v['trade'] or legal_on_gst).upper(), 'gstin': g, 'constitution': v['constitution'],
                 'address': f"{v['line']}, {v['city']}, {STATE_NAME[v['st']]} {v['pin']}", 'state': STATE_NAME[v['st']], 'registration_date': v['reg'], 'status': 'Active'}
            truth.append({'doc_id': d['id'], 'detected': 'gst_certificate', 'fields': f})
        elif d['file'].startswith('pan'):
            nm = v.get('proprietor') or v['legal'].upper()
            truth.append({'doc_id': d['id'], 'detected': 'pan_card', 'fields': {'name': nm, 'pan': v['pan']}})
        elif d['file'].startswith('cancelled'):
            truth.append({'doc_id': d['id'], 'detected': 'cancelled_cheque', 'fields': {'account_name': holder, 'account_number': v['bank'][1], 'ifsc': v['bank'][2], 'bank_name': v['bank'][3]}})
        else:
            truth.append({'doc_id': d['id'], 'detected': 'msme_certificate', 'fields': {'name': v['legal'].upper(), 'udyam': v['udyam']}})
    t, scen, exp = SCEN[sid]
    samples.append({'id': sid, 'type': t, 'scenario': scen, 'expect': exp, 'title': v['legal'] if not v['trade'] else f"{v['trade']} ({v['legal']})",
                    'email': {'from': f"{v['contact'][0]} <{v['contact'][1]}>", 'subject': EMAIL[sid][0], 'body': EMAIL[sid][1],
                              'received': f"2026-11-0{1 + int(sid[1:]) % 5}T{9 + int(sid[1:]) % 8:02d}:{(int(sid[1:]) * 7) % 60:02d}:00+05:30"},
                    'submission': sub, 'docs': docs, 'truth': truth, '_v': v})

# The fix Sundaram sends in round 2: an account in the company's own name.
FIX_V02 = {'bank': {'account_name': 'Sundaram Packaging Solutions Pvt Ltd', 'account_number': '661205009871', 'ifsc': 'ICIC0000001', 'bank_name': 'ICICI Bank'},
           'doc': {'declared': 'cancelled_cheque', 'file': 'fix_cancelled_cheque.png', 'mime': 'image/png'}}
BANK['661205009871'] = {'holder': 'SUNDARAM PACKAGING SOLUTIONS PRIVATE LIMITED', 'ifsc': 'ICIC0000001', 'status': 'Active'}

# ---------------------------------------------------------------- rendering
def specimen_pdf(c, w, h):
    c.saveState(); c.setFillColor(Color(0.85, 0.1, 0.1, alpha=0.10)); c.setFont('Helvetica-Bold', 64)
    c.translate(w / 2, h / 2); c.rotate(32); c.drawCentredString(0, 0, 'SPECIMEN · TEST DATA'); c.restoreState()
    c.setFont('Helvetica', 7); c.setFillColor(HexColor('#999999'))
    c.drawCentredString(w / 2, 22, 'Fictional specimen generated for testing the VETTED demo. Not a government document.')


def gst_pdf(path, v):
    c = canvas.Canvas(path, pagesize=A4); w, h = A4
    c.setFont('Helvetica-Bold', 15); c.drawCentredString(w / 2, h - 70, 'GOODS AND SERVICES TAX')
    c.setFont('Helvetica', 11); c.drawCentredString(w / 2, h - 88, 'Registration Certificate (specimen, Form REG-06 layout)')
    c.setFont('Helvetica-Bold', 12); c.drawString(60, h - 130, f"Registration Number: {v['gstin']}")
    rows = [('1. Legal Name', v.get('gst_legal', v['legal']).upper()), ('2. Trade Name, if any', (v['trade'] or v.get('gst_legal', v['legal'])).upper()),
            ('3. Constitution of Business', v['constitution']), ('4. Address of Principal Place of Business', f"{v['line']}, {v['city']}, {STATE_NAME[v['st']]} {v['pin']}"),
            ('5. Date of Liability', v['reg']), ('6. Period of Validity', f"From {v['reg']} To Not Applicable"), ('7. Type of Registration', 'Regular'),
            ('8. Particulars of Approving Authority', 'Signature digitally verified (specimen)'), ('9. Date of issue of Certificate', v['reg'])]
    y = h - 170
    for k, val in rows:
        c.setFont('Helvetica', 10); c.setFillColor(HexColor('#444444')); c.drawString(60, y, k)
        c.setFont('Helvetica-Bold', 10); c.setFillColor(HexColor('#111111')); c.drawString(290, y, val[:52]); y -= 26
    c.setFont('Helvetica', 9); c.setFillColor(HexColor('#555555'))
    c.drawString(60, y - 20, 'Annexure A: details of the proprietor / partners / directors are available on the GST portal.')
    specimen_pdf(c, w, h); c.save()


def udyam_pdf(path, v):
    c = canvas.Canvas(path, pagesize=A4); w, h = A4
    c.setFont('Helvetica-Bold', 15); c.drawCentredString(w / 2, h - 70, 'UDYAM REGISTRATION CERTIFICATE (specimen)')
    rows = [('Udyam Registration Number', v['udyam']), ('Name of Enterprise', v['legal'].upper()), ('Type of Enterprise', 'Micro'),
            ('Major Activity', 'Services' if v['cat'] == 'Services' else 'Manufacturing'), ('Address', f"{v['line']}, {v['city']} {v['pin']}"), ('Date of Udyam Registration', '2021-06-14')]
    y = h - 130
    for k, val in rows:
        c.setFont('Helvetica', 10); c.drawString(60, y, k); c.setFont('Helvetica-Bold', 10); c.drawString(260, y, val[:55]); y -= 26
    specimen_pdf(c, w, h); c.save()


def font(p, s): return ImageFont.truetype(p, s)


def stamp(img, scanned):
    d = ImageDraw.Draw(img, 'RGBA'); W, H = img.size
    txt = 'SPECIMEN · TEST DATA'
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
    # Watermark sits in the lower band, clear of the key numbers (PAN, account number), so it can't cause misreads.
    ld.text((W * 0.16, H * 0.72), txt, font=font(FB, int(H * 0.075)), fill=(200, 30, 30, 45))
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img); d.text((14, H - 22), 'Fictional specimen for testing VETTED. Not a real document.', font=font(F, 12), fill=(130, 130, 130, 255))
    if scanned:
        rgb = img.convert('L').convert('RGB').rotate(-1.4, expand=False, fillcolor=(235, 235, 230)).filter(ImageFilter.GaussianBlur(0.7))
        px = rgb.load()
        for _ in range(W * H // 40):
            x, y = random.randrange(W), random.randrange(H); g = random.randint(150, 230); px[x, y] = (g, g, g)
        return rgb
    return img.convert('RGB')


def pan_png(path, name, pan, scanned=False):
    W, H = 860, 540
    img = Image.new('RGBA', (W, H), (226, 236, 246, 255)); d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, W - 8, H - 8), 26, outline=(60, 90, 140, 255), width=4)
    d.text((40, 36), 'PERMANENT ACCOUNT NUMBER CARD', font=font(FB, 30), fill=(30, 50, 90, 255))
    d.text((40, 76), '(specimen layout, for testing)', font=font(F, 18), fill=(80, 90, 110, 255))
    d.text((40, 150), 'Name', font=font(F, 20), fill=(70, 70, 70, 255)); d.text((40, 178), name, font=font(FB, 32), fill=(15, 15, 15, 255))
    d.text((40, 250), 'Permanent Account Number', font=font(F, 20), fill=(70, 70, 70, 255)); d.text((40, 280), pan, font=font(FM, 46), fill=(15, 15, 15, 255))
    d.rectangle((640, 150, 810, 360), outline=(120, 130, 150, 255), width=2); d.text((672, 240), 'PHOTO', font=font(F, 22), fill=(150, 150, 160, 255))
    out = stamp(img, scanned); out.save(path, quality=72) if path.endswith('.jpg') else out.save(path)


def cheque_png(path, holder, acct, ifsc, bank, branch, scanned=False):
    W, H = 1200, 520
    img = Image.new('RGBA', (W, H), (238, 246, 240, 255)); d = ImageDraw.Draw(img)
    d.rectangle((6, 6, W - 6, H - 6), outline=(60, 110, 80, 255), width=3)
    d.text((36, 26), bank, font=font(FB, 34), fill=(20, 70, 45, 255)); d.text((36, 70), f'Branch: {branch}', font=font(F, 20), fill=(60, 60, 60, 255))
    d.text((36, 98), f'IFSC: {ifsc}', font=font(FM, 22), fill=(20, 20, 20, 255))
    d.text((W - 300, 30), 'Date  _ _ / _ _ / _ _ _ _', font=font(F, 20), fill=(60, 60, 60, 255))
    d.text((36, 160), 'Pay ________________________________________________ or Bearer', font=font(F, 22), fill=(90, 90, 90, 255))
    d.text((36, 210), 'Rupees ______________________________________________', font=font(F, 22), fill=(90, 90, 90, 255))
    d.text((36, 280), f'A/c No. {acct}', font=font(FM, 30), fill=(10, 10, 10, 255))
    d.text((W - 520, 360), f'For {holder}', font=font(FB, 24), fill=(10, 10, 10, 255))
    d.text((W - 520, 400), 'Authorised Signatory', font=font(F, 18), fill=(70, 70, 70, 255))
    d.text((60, 440), f'"000417"  {ifsc[-6:]}:  {acct[-6:]}"  31', font=font(FM, 22), fill=(40, 40, 40, 255))
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
    ld.line((180, 130, 900, 390), fill=(20, 20, 20, 210), width=6); ld.line((220, 130, 940, 390), fill=(20, 20, 20, 210), width=6)
    ld.text((420, 225), 'CANCELLED', font=font(FB, 64), fill=(20, 20, 20, 230))
    img.alpha_composite(lay)
    out = stamp(img, scanned); out.save(path, quality=72) if path.endswith('.jpg') else out.save(path)


def gst_jpg(path, v):
    W, H = 1240, 1650
    img = Image.new('RGBA', (W, H), (250, 250, 247, 255)); d = ImageDraw.Draw(img)
    d.text((W / 2 - 300, 90), 'GOODS AND SERVICES TAX', font=font(FB, 44), fill=(20, 20, 20, 255))
    d.text((W / 2 - 330, 150), 'Registration Certificate (specimen layout)', font=font(F, 30), fill=(40, 40, 40, 255))
    d.text((90, 240), f"Registration Number: {v['gstin']}", font=font(FB, 34), fill=(10, 10, 10, 255))
    rows = [('Legal Name', v['legal'].upper()), ('Trade Name', (v['trade'] or v['legal']).upper()), ('Constitution of Business', v['constitution']),
            ('Address', f"{v['line']}, {v['city']}"), ('', f"{STATE_NAME[v['st']]} {v['pin']}"), ('Date of Liability', v['reg']), ('Type of Registration', 'Regular')]
    y = 340
    for k, val in rows:
        d.text((90, y), k, font=font(F, 28), fill=(60, 60, 60, 255)); d.text((520, y), val, font=font(FB, 28), fill=(15, 15, 15, 255)); y += 64
    stamp(img, True).save(path, quality=70)


BRANCH = {'HDFC0000082': 'Chennai - Nungambakkam', 'ICIC0000001': 'Chennai Cenotaph Road', 'UTIB0000006': 'Chennai', 'SBIN0000800': 'Chennai Main',
          'HDFC0001234': 'Park Street', 'HDFC0000140': 'RT Nagar, Bangalore', 'KKBK0000462': 'Chennai - Annai Salai', 'CIUB0000001': 'Chennai T Nagar', 'IOBA0000002': 'Adyar'}

for s in samples:
    v = s.pop('_v'); d = os.path.join(OUT, s['id']); os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    sc = bool(v.get('scanned'))
    holder = v.get('cheque_name') or (v.get('proprietor') or v['bank'][0]).upper()
    pan_name = v.get('proprietor') or v['legal'].upper()
    for doc in s['docs']:
        p = os.path.join(d, doc['file'])
        if doc['file'] == 'gst_certificate.pdf': gst_pdf(p, v)
        elif doc['file'] == 'gst_certificate.jpg': gst_jpg(p, v)
        elif doc['file'].startswith('pan_card'): pan_png(p, pan_name, v['pan'], sc)
        elif doc['file'].startswith('cancelled'): cheque_png(p, holder, v['bank'][1], v['bank'][2], v['bank'][3], BRANCH[v['bank'][2]], sc)
        elif doc['file'].startswith('udyam'): udyam_pdf(p, v)
    if v.get('wrong_doc'):
        s['truth'][2] = {'doc_id': 'd3', 'detected': 'pan_card', 'fields': {'name': pan_name, 'pan': v['pan']}}
    if s['id'] == 'v02':
        cheque_png(os.path.join(d, FIX_V02['doc']['file']), 'SUNDARAM PACKAGING SOLUTIONS PVT LTD', FIX_V02['bank']['account_number'], 'ICIC0000001', 'ICICI Bank', BRANCH['ICIC0000001'])
    if s['id'] == 'v06':
        cheque_png(os.path.join(d, 'fix_cancelled_cheque.png'), holder, v['bank'][1], v['bank'][2], v['bank'][3], BRANCH[v['bank'][2]])

FIXES = {'v02': {'bank': FIX_V02['bank'], 'file': 'fix_cancelled_cheque.png', 'holder': 'SUNDARAM PACKAGING SOLUTIONS PVT LTD'},
         'v06': {'bank': None, 'file': 'fix_cancelled_cheque.png', 'holder': V['v06']['bank'][0].upper()},
         'v09': {'fields': {'business_type': 'Partnership'}}}
json.dump({'samples': samples, 'registry': REGISTRY, 'bank_records': BANK, 'fix_v02': FIX_V02, 'fixes': FIXES,
           'verity_vendors': [dict(zip(['id', 'name', 'gstin', 'pan', 'account_number', 'ifsc', 'bank_name', 'phone', 'email', 'address'], x)) for x in VERITY_VENDORS]},
          open(os.path.join(ROOT, 'src', 'data', 'samples.json'), 'w'), indent=1, ensure_ascii=False)
print('built', len(samples), 'submissions')
for s in samples: print(s['id'], s['expect'], s['submission']['gstin'], [x['file'] for x in s['docs']])
