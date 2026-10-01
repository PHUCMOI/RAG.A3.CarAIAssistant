#!/usr/bin/env python3
"""Build the 50-model Vietnam MVP dataset from DVM-CAR CSV files.

Only Python's standard library is used so the script can run on a clean machine.
The source dataset is UK-oriented; UK values are retained as provenance fields and
must not be presented as current Vietnam market specifications or prices.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TABLES = ROOT / "data" / "tables_V2.0"
IMAGES_ROOT = ROOT / "data" / "Confirmed_fronts" / "confirmed_fronts"
OUTPUT = ROOT / "data" / "processed"
DATABASE = ROOT / "database"
AS_OF = "2026-10-01"


# model_id, Vietnamese display name, market status, evidence source, optional current price
SELECTED = [
    ("92_44", "Toyota Yaris", "official_historical", "toyota_profile_2022", 684_000_000),
    ("92_30", "Toyota Prius", "present_via_import", "toyota_hybrid_vn", 1_320_000_000),
    ("92_34", "Toyota RAV4", "present_via_import", "toyota_vn_company", 2_400_000_000),
    ("92_19", "Toyota Hilux", "official_current", "toyota_prices_2026", 632_000_000),
    ("92_21", "Toyota Land Cruiser", "official_current", "toyota_catalog_2026", 4_196_000_000),
    ("92_11", "Toyota Corolla", "official_historical", "toyota_vn_company", 870_000_000),
    ("92_2", "Toyota Alphard", "official_current", "toyota_catalog_2026", 4_415_000_000),
    ("92_9", "Toyota Camry", "official_current", "toyota_prices_2026", 1_220_000_000),
    ("34_3", "Honda CR-V", "official_current", "honda_products_2026", 1_039_000_000),
    ("34_11", "Honda Jazz", "official_historical", "honda_vn_recall", 544_000_000),
    ("34_2", "Honda Civic", "official_current", "honda_products_2026", 789_000_000),
    ("34_8", "Honda HR-V", "official_current", "honda_products_2026", 669_000_000),
    ("34_1", "Honda Accord", "official_historical", "honda_vn_recall", 1_319_000_000),
    ("57_10", "Mazda2", "official_current", "mazda_vn_lineup", 418_000_000),
    ("57_11", "Mazda3", "official_current", "mazda_vn_lineup", 569_000_000),
    ("57_13", "Mazda6", "official_historical", "mazda_vn_lineup", 769_000_000),
    ("57_6", "Mazda CX-3", "official_current", "mazda_vn_lineup", 519_000_000),
    ("57_7", "Mazda CX-5", "official_current", "mazda_vn_lineup", 699_000_000),
    ("57_5", "Mazda BT-50", "official_historical", "mazda_vn_lineup", 554_000_000),
    ("36_8", "Hyundai Grand i10", "official_current", "hyundai_products_2026", 360_000_000),
    ("36_20", "Hyundai Santa Fe", "official_current", "hyundai_products_2026", 1_069_000_000),
    ("36_24", "Hyundai Tucson", "official_current", "hyundai_products_2026", 769_000_000),
    ("36_1", "Hyundai Accent", "official_current", "hyundai_products_2026", 439_000_000),
    ("36_4", "Hyundai Elantra", "official_current", "hyundai_products_2026", 579_000_000),
    ("43_9", "Kia Rio", "official_historical", "kia_products_2026", 470_000_000),
    ("43_7", "Kia Morning (Picanto)", "official_current", "kia_products_2026", 325_000_000),
    ("43_13", "Kia Sportage", "official_current", "kia_products_2026", 769_000_000),
    ("43_11", "Kia Sorento", "official_current", "kia_products_2026", 1_199_000_000),
    ("43_1", "Kia Carens", "official_current", "kia_products_2026", 559_000_000),
    ("43_6", "Kia K5 (Optima)", "official_current", "kia_products_2026", 769_000_000),
    ("43_10", "Kia Carnival (Sedona)", "official_current", "kia_products_2026", 1_299_000_000),
    ("43_3", "Kia K3 (Cerato)", "official_current", "kia_products_2026", 584_000_000),
    ("29_14", "Ford Focus", "official_historical", "ford_owner_manuals", 626_000_000),
    ("29_13", "Ford Fiesta", "official_historical", "ford_owner_manuals", 545_000_000),
    ("29_4", "Ford EcoSport", "official_historical", "ford_owner_manuals", 603_000_000),
    ("29_30", "Ford Ranger", "official_current", "ford_prices_2026", 707_000_000),
    ("29_28", "Ford Mustang", "present_via_import", "ford_owner_manuals", 2_850_000_000),
    ("29_5", "Ford Edge", "present_via_import", "ford_owner_manuals", 1_560_000_000),
    ("29_9", "Ford Explorer", "official_current", "ford_current_lineup", 2_099_000_000),
    ("62_16", "Mitsubishi Outlander", "official_current", "mitsubishi_quote", 825_000_000),
    ("62_15", "Mitsubishi Mirage", "official_historical", "mitsubishi_vn_history", 350_500_000),
    ("62_7", "Mitsubishi Eclipse Cross", "official_historical", "mitsubishi_vn_history", 595_000_000),
    ("62_20", "Mitsubishi Pajero Sport (Shogun Sport)", "official_current", "mitsubishi_quote", 1_110_000_000),
    ("64_41", "Nissan X-Trail", "official_historical", "nissan_products", 839_000_000),
    ("64_20", "Nissan Navara", "official_current", "nissan_products", 748_000_000),
    ("64_3", "Nissan Almera", "official_current", "nissan_almera", 489_000_000),
    ("64_14", "Nissan Juke", "official_historical", "nissan_news_2015", 1_060_000_000),
    ("64_19", "Nissan Murano", "official_historical", "nissan_news_2015", 2_489_000_000),
    ("87_10", "Suzuki Swift", "official_current", "suzuki_products", 569_000_000),
    ("87_6", "Suzuki Jimny", "official_current", "suzuki_products", 789_000_000),
]


SOURCES = [
    {"source_id": "dvm_basic", "title": "DVM-CAR Basic_table.csv", "url": "data/tables_V2.0/Basic_table.csv", "source_type": "dataset", "supports": "brand, model and Genmodel_ID"},
    {"source_id": "dvm_ads", "title": "DVM-CAR Ad tables", "url": "data/tables_V2.0/Ad_table.csv", "source_type": "dataset", "supports": "historical UK listing attributes"},
    {"source_id": "dvm_images", "title": "DVM-CAR Image_table.csv", "url": "data/tables_V2.0/Image_table.csv", "source_type": "dataset", "supports": "image identifiers and viewpoints"},
    {"source_id": "toyota_profile_2022", "title": "Toyota Vietnam company profile 2022", "url": "https://www.toyota.com.vn/media/41oecfvd/vie-toyotaprofile-2022-singlepage.pdf?usp=sharing", "source_type": "official", "supports": "historical Yaris presence"},
    {"source_id": "toyota_hybrid_vn", "title": "Toyota Vietnam hybrid overview", "url": "https://www.toyota.com.vn/cong-nghe/hybrid/", "source_type": "official", "supports": "Prius lineage and Vietnam hybrid context"},
    {"source_id": "toyota_vn_company", "title": "Toyota Vietnam sustainability report 2023", "url": "https://www.toyota.com.vn/media/ccje2e4a/baocao-ptbv-toyota-2023_sua05162024-final-1.pdf", "source_type": "official", "supports": "Toyota models sold in Vietnam"},
    {"source_id": "toyota_catalog_2026", "title": "Toyota Vietnam vehicle catalogue", "url": "https://www.toyota.com.vn/danh-sach-xe", "source_type": "official", "supports": "current models and list prices"},
    {"source_id": "toyota_prices_2026", "title": "Toyota Vietnam 2026 price guide", "url": "https://www.toyota.com.vn/tin-tuc/thong-tin-bo-tro/bang-gia-xe-toyota-43840", "source_type": "official", "supports": "current prices"},
    {"source_id": "honda_products_2026", "title": "Honda Vietnam automobiles", "url": "https://www.honda.com.vn/o-to/san-pham", "source_type": "official", "supports": "current models and list prices"},
    {"source_id": "honda_vn_recall", "title": "Honda Vietnam recall archive", "url": "https://www.honda.com.vn/o-to/trieu-hoi", "source_type": "official", "supports": "historical model presence"},
    {"source_id": "mazda_vn_lineup", "title": "Mazda Vietnam product introduction", "url": "https://mazdamotors.vn/news-and-events/news-and-events-content/news-and-events/chuong-trinh-gioi-thieu-san-pham-mazda-the-he-moi-dang-cap-moi", "source_type": "official", "supports": "Vietnam lineup"},
    {"source_id": "hyundai_products_2026", "title": "Hyundai Thanh Cong products", "url": "https://hyundai.thanhcong.vn/san-pham", "source_type": "official", "supports": "current Vietnam lineup"},
    {"source_id": "hyundai_authorized_prices_2026", "title": "Hyundai Vinh Yen authorized dealer price list", "url": "https://hyundaigiatot.vn/", "source_type": "authorized_dealer", "supports": "2026 starting prices for Grand i10, Accent, Elantra, Tucson and Santa Fe"},
    {"source_id": "kia_products_2026", "title": "Kia Vietnam products and prices", "url": "https://kiavietnam.com.vn/gia-xe?display=rows&products%5B%5D=new-morning&sort=a-z", "source_type": "official", "supports": "current and renamed Vietnam models"},
    {"source_id": "ford_owner_manuals", "title": "Ford Vietnam owner manual archive", "url": "https://www.ford.com.vn/support/owner-manuals/owner-manuals-sitemap/", "source_type": "official", "supports": "current and historical Vietnam models"},
    {"source_id": "ford_current_lineup", "title": "Ford Vietnam current models", "url": "https://www.ford.com.vn/support/how-tos/support-search-only/ph%C6%B0%C6%A1ng-ti%E1%BB%87n-li%C3%AAn-quan/c%C3%A1c-d%C3%B2ng-xe-n%C3%A0o-%C4%91ang-%C4%91%C6%B0%E1%BB%A3c-ph%C3%A2n-ph%E1%BB%91i-t%E1%BA%A1i-th%E1%BB%9Di-%C4%91i%E1%BB%83m-hi%E1%BB%87n-t%E1%BA%A1i", "source_type": "official", "supports": "current lineup"},
    {"source_id": "ford_prices_2026", "title": "Ford Vietnam price list", "url": "https://www.ford.com.vn/shopping/price-list/", "source_type": "official", "supports": "current prices"},
    {"source_id": "mitsubishi_quote", "title": "Mitsubishi Motors Vietnam quote form", "url": "https://uat-website.mitsubishi-motors.com.vn/yeu-cau-bao-gia", "source_type": "official", "supports": "current models and starting prices"},
    {"source_id": "mitsubishi_vn_history", "title": "Mitsubishi Motors Vietnam history", "url": "https://mitsubishi-motors.com.vn/ve-chung-toi/lich-su-phat-trien", "source_type": "official", "supports": "historical model presence"},
    {"source_id": "nissan_products", "title": "Nissan Vietnam products", "url": "https://www.nissanvietnam.vn/products.html", "source_type": "official", "supports": "current and historical models"},
    {"source_id": "nissan_almera", "title": "Nissan Almera Vietnam", "url": "https://www.nissanvietnam.vn/almera.html", "source_type": "official", "supports": "current price and specifications"},
    {"source_id": "nissan_news_2015", "title": "Nissan model range in Vietnam", "url": "https://asean.nissannews.com/en/releases/nissan-introduces-the-all-new-np300-navara-to-vietnam", "source_type": "official", "supports": "historical Vietnam lineup"},
    {"source_id": "suzuki_products", "title": "Suzuki Vietnam automobiles", "url": "https://suzuki.com.vn/", "source_type": "official", "supports": "current models and price context"},
    {"source_id": "toyota_warranty", "title": "Toyota Vietnam warranty policy", "url": "https://www.toyota.com.vn/dich-vu/chinh-sach-bao-hanh", "source_type": "official", "supports": "36 months or 100,000 km warranty"},
    {"source_id": "honda_warranty", "title": "Honda Vietnam automobile warranty FAQ", "url": "https://www.honda.com.vn/cau-hoi-thuong-gap?category=o-to&category_child=dich-vu&category_tab=bao-hanhbao-duong-o-to", "source_type": "official", "supports": "36 months or 100,000 km warranty"},
    {"source_id": "mazda_warranty", "title": "Mazda Vietnam warranty policy", "url": "https://mazdamotors.vn/owners-warranty", "source_type": "official", "supports": "60 months or 150,000 km for vehicles sold from 2023-10-01"},
    {"source_id": "kia_warranty", "title": "Kia Vietnam five-year warranty announcement", "url": "https://kiavietnam.com.vn/tin-tuc/chi-tiet/kia-viet-nam-chinh-thuc-ap-dung-chinh-sach-bao-hanh-xe-5-nam", "source_type": "official", "supports": "60 months or 150,000 km for vehicles sold from 2023-10-01, except stated exclusions"},
    {"source_id": "hyundai_warranty", "title": "Hyundai Thanh Cong electronic warranty policy", "url": "https://hyundai.thanhcong.vn/dich-vu-ky-thuat/chinh-sach-bao-hanh?isTabActive=1", "source_type": "official", "supports": "60 months or 100,000 km for locally assembled passenger vehicles"},
    {"source_id": "ford_warranty", "title": "Ford Vietnam new vehicle warranty FAQ", "url": "https://www.ford.com.vn/owner/vehicle-support/faqs/", "source_type": "official", "supports": "standard 36 months or 100,000 km; selected models may have longer coverage"},
    {"source_id": "mitsubishi_warranty", "title": "Mitsubishi Motors Vietnam standard warranty reference", "url": "https://www.mitsubishi-motors.com.vn/tin-tuc/bao-hanh-mo-rong-n152372.html", "source_type": "official", "supports": "standard 36 months or 100,000 km"},
    {"source_id": "nissan_warranty", "title": "Nissan Vietnam warranty policy", "url": "https://www.nissanvietnam.vn/chinh-sach-bao-hanh-c4.html", "source_type": "official", "supports": "60 months or 100,000 km"},
    {"source_id": "suzuki_warranty", "title": "Suzuki Vietnam automobile warranty policy", "url": "https://suzuki.com.vn/pages/quy-dinh-bao-hanh-o-to", "source_type": "official", "supports": "standard 36 months or 100,000 km"},
    {"source_id": "toyota_hilux_specs", "title": "Toyota Hilux specifications", "url": "https://cantho.toyota.com.vn/hilux-2-4l-4x2-mt", "source_type": "authorized_dealer", "supports": "3,085 mm Hilux wheelbase"},
    {"source_id": "mazda_bt50_specs", "title": "Mazda BT-50 official brochure", "url": "https://mazdamotors.vn/media/vr0pfecl/brochure-mazda-bt-50_28-07.pdf", "source_type": "official", "supports": "3,220 mm BT-50 wheelbase"},
    {"source_id": "ford_ranger_specs", "title": "Ford Vietnam Ranger specifications", "url": "https://www.ford.com.vn/trucks/ford-ranger/", "source_type": "official", "supports": "3,270 mm Ranger wheelbase"},
    {"source_id": "nissan_navara_specs", "title": "Nissan Vietnam Navara specifications", "url": "https://www.nissanvietnam.vn/images/upload_file/catalouge-navara_website_1742354691.pdf", "source_type": "official", "supports": "3,150 mm Navara wheelbase"},
    {"source_id": "ford_explorer_specs_vn", "title": "Ford Vietnam all-new Explorer introduction", "url": "https://www.ford.com.vn/about/news/2022/ford-explorer-hoan-toan-moi-chiec-suv-ban-chay-nhat-nuoc-my/", "source_type": "official", "supports": "301 hp output and 3,025 mm wheelbase for the Vietnam Explorer"},
    {"source_id": "ford_explorer_dimensions", "title": "Ford Explorer technical specifications", "url": "https://media.ford.com/content/dam/fordmedia/North%20America/US/product/2021/explorer/21Explorer_Tech_Specs.pdf", "source_type": "official", "supports": "Explorer exterior dimensions for the matching sixth-generation platform"},
    {"source_id": "toyota_yaris_price_2023", "title": "Toyota Yaris 2023 listed price", "url": "https://bacninhtoyota.com.vn/toyota-yaris/", "source_type": "authorized_dealer", "supports": "Last referenced Vietnam starting price of VND 684,000,000"},
    {"source_id": "toyota_tax_values_2026", "title": "2026 Vietnam vehicle registration-tax valuation schedule", "url": "https://thuvienphapluat.vn/van-ban/Thue-Phi-Le-Phi/Quyet-dinh-02-2026-QD-UBND-Bang-gia-tinh-Le-phi-truoc-ba-doi-voi-o-to-xe-may-Thanh-Hoa-688116.aspx", "source_type": "government", "supports": "Reference valuations for imported Toyota Prius and RAV4 vehicles"},
    {"source_id": "toyota_rav4_import_price_2026", "title": "Toyota RAV4 private-import reference price", "url": "https://xe.chotot.com/oto-toyota-rav4-sd6a0e", "source_type": "market_reference", "supports": "September 2026 Vietnam private-import reference price of approximately VND 2,400,000,000"},
    {"source_id": "honda_historical_prices", "title": "Honda Accord and Jazz historical Vietnam prices", "url": "https://www.danhgiaxe.com/danh-gia/danh-gia-so-bo-xe-honda-jazz-2020-29023", "source_type": "market_reference", "supports": "Honda Jazz historical starting price; Accord uses the separately recorded VND 1,319,000,000 list-price reference"},
    {"source_id": "mazda6_price_2024", "title": "Mazda6 official price announcement", "url": "https://mazdamotors.vn/news-and-events/news-and-events-content/news-and-events/mazda6-them-tinh-nang-cong-nghe-gia-chi-tu-769-trieu", "source_type": "official", "supports": "August 2024 starting price of VND 769,000,000"},
    {"source_id": "mazda_bt50_price_2026", "title": "Mazda BT-50 Vietnam reference price", "url": "https://baolamdong.vn/gia-xe-o-to/mazda/bt-50", "source_type": "market_reference", "supports": "September 2026 starting price of VND 554,000,000"},
    {"source_id": "kia_rio_price_2017", "title": "Kia Rio final Vietnam price reference", "url": "https://oto.com.vn/kinh-nghiem-mua-ban-xe/7-o-to-co-gia-lan-banh-600-trieu-dong-cho-khach-viet-choi-tet-articleid-kvmuamp", "source_type": "market_reference", "supports": "Historical starting price of VND 470,000,000"},
    {"source_id": "ford_historical_prices", "title": "Ford historical Vietnam price references", "url": "https://xe.chotot.com/oto-ford-ecosport-sd6a0e", "source_type": "market_reference", "supports": "Final or historical starting prices for EcoSport, Fiesta and Focus"},
    {"source_id": "ford_import_values", "title": "Ford import price and registration valuation references", "url": "https://thuvienphapluat.vn/hoi-dap-phap-luat/bang-gia-tinh-le-phi-truoc-ba-xe-o-to-ford-phan-1-267552.html", "source_type": "government", "supports": "Ford Edge registration-tax valuation; Mustang uses a separate current private-import market reference"},
    {"source_id": "ford_mustang_import_price_2026", "title": "Ford Mustang private-import Vietnam price reference", "url": "https://fumo.com.vn/gia-xe-ford-mustang-bao-nhieu.html", "source_type": "market_reference", "supports": "2026 private-import reference starting near VND 2,850,000,000"},
    {"source_id": "mitsubishi_mirage_price_2018", "title": "Mitsubishi Mirage official price announcement", "url": "https://www.mitsubishi-motors.com.vn/tin-tuc/gia-moi-hap-dan-cho-attrage-va-mirage-trong-thang-102018-n19203.html", "source_type": "official", "supports": "October 2018 starting price of VND 350,500,000"},
    {"source_id": "mitsubishi_eclipse_price_reference", "title": "Mitsubishi Eclipse Cross market price reference", "url": "https://tinbanxe.vn/oto/mitsubishi/eclipse-cross/", "source_type": "market_reference", "supports": "Reference price of VND 595,000,000; model was not officially distributed broadly in Vietnam"},
    {"source_id": "nissan_historical_prices", "title": "Nissan historical Vietnam price references", "url": "https://vnexpress.net/nissan-juke-2015-gia-1-06-ty-tai-viet-nam-3136545.html", "source_type": "market_reference", "supports": "Historical Vietnam prices for Juke and X-Trail; Murano uses a government registration-tax valuation"},
    {"source_id": "nissan_tax_values", "title": "Vietnam registration-tax valuation schedule for Nissan vehicles", "url": "https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2019/4/28895/26636-1-2019413-414618-qd-btc.pdf", "source_type": "government", "supports": "Nissan Murano reference valuation of VND 2,489,000,000"},
]


DEALER_SOURCES = [
    {"source_id": "toyota_dealers", "title": "Toyota Vietnam dealer locator", "url": "https://www.toyota.com.vn/lien-he-dai-ly", "source_type": "official", "supports": "Toyota authorized dealer names, locations and contact details"},
    {"source_id": "honda_dealers", "title": "Honda Vietnam automobile dealer locator", "url": "https://www.honda.com.vn/o-to/dai-ly/danh-sach-dai-ly", "source_type": "official", "supports": "Honda authorized automobile dealer network"},
    {"source_id": "mazda_dealers", "title": "Mazda Vietnam dealer network", "url": "https://mazdamotors.vn/customer-care", "source_type": "official", "supports": "Mazda authorized dealer and service network"},
    {"source_id": "hyundai_dealers", "title": "Hyundai Thanh Cong dealer directory", "url": "https://hyundai.thanhcong.vn/thong-tin-dai-ly", "source_type": "official", "supports": "Hyundai authorized dealer names, locations, phones and websites"},
    {"source_id": "kia_dealers", "title": "Kia Vietnam dealer locator", "url": "https://kiavietnam.com.vn/dai-ly", "source_type": "official", "supports": "Kia authorized dealer names, locations, phones and websites"},
    {"source_id": "ford_dealers_2026", "title": "Ford Vietnam authorized dealer list 2026", "url": "https://www.ford.com.vn/content/dam/Ford/vn/about/news/2026/chuong-trinhco-hoi-vang-san-sang-ruoc-xe/the-le-chuong-trinh-co-hoi-vang-san-sang-ruoc-xe-thang-5-2026.pdf", "source_type": "official", "supports": "Ford authorized dealer names and addresses"},
    {"source_id": "mitsubishi_dealers", "title": "Mitsubishi Motors Vietnam dealer network", "url": "https://www.mitsubishi-motors.com.vn/dealer", "source_type": "official", "supports": "Mitsubishi authorized dealer names and locations"},
    {"source_id": "nissan_dealers", "title": "Nissan Vietnam dealer locator", "url": "https://www.nissanvietnam.vn/tim-kiem-dai-ly.html", "source_type": "official", "supports": "Nissan authorized dealer names, locations and phones"},
    {"source_id": "suzuki_dealers", "title": "Suzuki Vietnam dealer contact directory", "url": "https://suzuki.com.vn/pages/contactdealer", "source_type": "official", "supports": "Suzuki authorized dealer location and contact details"},
]

SOURCES.extend(DEALER_SOURCES)


DEALERS = [
    {"name": "Toyota My Dinh", "address": "15 Pham Hung Street, My Dinh 2 Ward, Nam Tu Liem District", "city": "Hanoi", "phone": "+84 934 891 515", "website": "http://toyotamydinh.com.vn/", "brand": "Toyota", "source_id": "toyota_dealers"},
    {"name": "Toyota An Suong", "address": "382 Le Quang Dao Street, Trung My Tay Ward", "city": "Ho Chi Minh City", "phone": "1900 7339", "website": "http://www.toyota-ansuong.vn/", "brand": "Toyota", "source_id": "toyota_dealers"},
    {"name": "Toyota Da Nang", "address": "69-71 Duy Tan Street, Hoa Cuong Ward", "city": "Da Nang", "phone": "+84 905 955 204", "website": "https://danang.toyota.com.vn/", "brand": "Toyota", "source_id": "toyota_dealers"},
    {"name": "Honda Automobile My Dinh", "address": "2 Le Duc Tho Street, Tu Liem Ward", "city": "Hanoi", "phone": "+84 375 837 979", "website": "https://hondaotomydinh.vn/", "brand": "Honda", "source_id": "honda_dealers"},
    {"name": "Honda Automobile Cong Hoa", "address": "18 Cong Hoa Street, Tan Son Nhat Ward", "city": "Ho Chi Minh City", "phone": "+84 90 866 8700", "website": "https://hondaotoconghoa.com.vn/", "brand": "Honda", "source_id": "honda_dealers"},
    {"name": "Honda Automobile Da Nang Hai Chau", "address": "178 September 2 Street, Hoa Cuong Ward", "city": "Da Nang", "phone": "+84 236 378 8888", "website": "https://hondaotodanang.com.vn/", "brand": "Honda", "source_id": "honda_dealers"},
    {"name": "Mazda Pham Van Dong", "address": "Pham Van Dong Street, Bac Tu Liem District", "city": "Hanoi", "phone": "+84 933 805 628", "website": "https://mazdaphamvandong.vn/", "brand": "Mazda", "source_id": "mazda_dealers"},
    {"name": "Mazda Da Nang", "address": "Group 14, Pham Van Dong Street, An Hai Ward", "city": "Da Nang", "phone": "+84 933 806 726", "website": "https://mazdadanang.com/", "brand": "Mazda", "source_id": "mazda_dealers"},
    {"name": "Hyundai Dong Do", "address": "16A Pham Hung Street, Tu Liem Ward", "city": "Hanoi", "phone": "+84 987 885 588", "website": "https://hyundai-vietnam.vn/", "brand": "Hyundai", "source_id": "hyundai_dealers"},
    {"name": "Hyundai Son Tra 3S", "address": "286 Pham Hung Street, Hoa Xuan Ward", "city": "Da Nang", "phone": "+84 236 377 3558", "website": "https://hyundai-sontra.vn/", "brand": "Hyundai", "source_id": "hyundai_dealers"},
    {"name": "Kia Binh Tan", "address": "73-75 Vo Van Kiet Street, An Lac Ward", "city": "Ho Chi Minh City", "phone": "+84 938 807 102", "website": "https://kiabinhtan.vn/", "brand": "Kia", "source_id": "kia_dealers"},
    {"name": "Kia Tan Son Nhat", "address": "7 Hoang Minh Giam Street, Duc Nhuan Ward", "city": "Ho Chi Minh City", "phone": "+84 938 807 607", "website": "https://kiatansonnhat.vn/", "brand": "Kia", "source_id": "kia_dealers"},
    {"name": "Ha Noi Ford", "address": "311-313 Truong Chinh Street, Phuong Liet Ward", "city": "Hanoi", "phone": "+84 868 059 999", "website": "https://www.hanoiford.com.vn/", "brand": "Ford", "source_id": "ford_dealers_2026"},
    {"name": "Sai Gon Ford", "address": "61A Cao Thang Street, Ban Co Ward", "city": "Ho Chi Minh City", "phone": "1800 8353", "website": "https://saigonford.com.vn/", "brand": "Ford", "source_id": "ford_dealers_2026"},
    {"name": "Dana Ford", "address": "286 Pham Hung Street, Hoa Xuan Ward", "city": "Da Nang", "phone": "+84 766 528 555", "website": "https://danaford.com.vn/", "brand": "Ford", "source_id": "ford_dealers_2026"},
    {"name": "Mitsubishi Kim Lien Hanoi", "address": "26A Pham Van Dong Street, Dong Ngac Ward", "city": "Hanoi", "phone": "+84 906 997 600", "website": "https://www.mitsubishi-motors.com.vn/dealer", "brand": "Mitsubishi", "source_id": "mitsubishi_dealers"},
    {"name": "Mitsubishi SATSCO", "address": "1A Hong Ha Street, Tan Son Hoa Ward", "city": "Ho Chi Minh City", "phone": "+84 938 209 520", "website": "https://mitsubishi-satsco.com.vn/", "brand": "Mitsubishi", "source_id": "mitsubishi_dealers"},
    {"name": "Mitsubishi Daesco Da Nang", "address": "51 Phan Dang Luu Street, Hoa Cuong Ward", "city": "Da Nang", "phone": "+84 905 715 368", "website": "https://mitsubishi-danang.com/", "brand": "Mitsubishi", "source_id": "mitsubishi_dealers"},
    {"name": "Nissan Giai Phong", "address": "Km 12, National Highway 1A, Thanh Tri Commune", "city": "Hanoi", "phone": "+84 931 506 666", "website": "https://www.nissanvietnam.vn/tim-kiem-dai-ly.html", "brand": "Nissan", "source_id": "nissan_dealers"},
    {"name": "Nissan Sai Gon", "address": "816 Su Van Hanh Street, Ward 12, District 10", "city": "Ho Chi Minh City", "phone": "+84 903 924 899", "website": "https://www.nissanvietnam.vn/agency.html", "brand": "Nissan", "source_id": "nissan_dealers"},
    {"name": "Nissan Da Nang", "address": "875 Nguyen Huu Tho Street, Cam Le Ward", "city": "Da Nang", "phone": "+84 966 007 999", "website": "https://www.nissanvietnam.vn/tim-kiem-dai-ly.html", "brand": "Nissan", "source_id": "nissan_dealers"},
    {"name": "Suzuki NISU", "address": "449 Nguyen Van Linh Street, Phuc Dong Ward, Long Bien District", "city": "Hanoi", "phone": "+84 902 233 516", "website": "https://suzuki.com.vn/pages/contactdealer", "brand": "Suzuki", "source_id": "suzuki_dealers"},
]


ALIASES = {
    "43_7": ["Picanto", "Morning"],
    "43_6": ["Optima", "K5"],
    "43_10": ["Sedona", "Carnival"],
    "43_3": ["Cerato", "K3"],
    "62_20": ["Shogun Sport", "Pajero Sport"],
    "36_8": ["i10", "Grand i10"],
}


BRAND_WARRANTIES = {
    "Toyota": {"duration_months": 36, "distance_km": 100_000, "source_id": "toyota_warranty", "conditions": "Basic new-vehicle warranty; whichever limit comes first. Extended programs have separate conditions."},
    "Honda": {"duration_months": 36, "distance_km": 100_000, "source_id": "honda_warranty", "conditions": "Standard reference policy; whichever limit comes first. Confirm eligibility by VIN and sale date."},
    "Mazda": {"duration_months": 60, "distance_km": 150_000, "source_id": "mazda_warranty", "conditions": "Applies to Mazda vehicles sold in Vietnam from 2023-10-01; whichever limit comes first."},
    "Kia": {"duration_months": 60, "distance_km": 150_000, "source_id": "kia_warranty", "conditions": "Applies from 2023-10-01; whichever limit comes first. Model-specific exclusions may apply."},
    "Hyundai": {"duration_months": 60, "distance_km": 100_000, "source_id": "hyundai_warranty", "conditions": "Reference policy for locally assembled Hyundai passenger vehicles distributed by Hyundai Thanh Cong; imported vehicles may differ."},
    "Ford": {"duration_months": 36, "distance_km": 100_000, "source_id": "ford_warranty", "conditions": "Standard new-vehicle warranty; selected models may receive up to 60 months or 150,000 km. Confirm by model and VIN."},
    "Mitsubishi": {"duration_months": 36, "distance_km": 100_000, "source_id": "mitsubishi_warranty", "conditions": "Standard manufacturer warranty; extended warranty is a separate program."},
    "Nissan": {"duration_months": 60, "distance_km": 100_000, "source_id": "nissan_warranty", "conditions": "New-vehicle warranty; whichever limit comes first. Confirm eligibility by sale date and VIN."},
    "Suzuki": {"duration_months": 36, "distance_km": 100_000, "source_id": "suzuki_warranty", "conditions": "Standard automobile warranty; whichever limit comes first. Hybrid components and extended coverage use separate limits."},
}


SPEC_OVERRIDES = {
    "92_2": {"engine_power_hp": 185, "length_mm": 5010, "width_mm": 1850, "height_mm": 1950, "wheelbase_mm": 3000},
    "92_9": {"length_mm": 4920, "width_mm": 1840, "height_mm": 1445, "wheelbase_mm": 2825},
    "92_19": {"wheelbase_mm": 3085},
    "57_5": {"wheelbase_mm": 3220},
    "29_30": {"wheelbase_mm": 3270},
    "29_9": {"engine_power_hp": 301, "length_mm": 5050, "width_mm": 2004, "height_mm": 1775, "wheelbase_mm": 3025},
    "64_20": {"wheelbase_mm": 3150},
}


PRICE_SOURCE_OVERRIDES = {
    "92_44": "toyota_yaris_price_2023",
    "92_30": "toyota_tax_values_2026",
    "92_34": "toyota_rav4_import_price_2026",
    "92_11": "toyota_prices_2026",
    "34_11": "honda_historical_prices",
    "34_1": "honda_historical_prices",
    "57_13": "mazda6_price_2024",
    "57_5": "mazda_bt50_price_2026",
    "36_8": "hyundai_authorized_prices_2026",
    "36_20": "hyundai_authorized_prices_2026",
    "36_24": "hyundai_authorized_prices_2026",
    "36_1": "hyundai_authorized_prices_2026",
    "36_4": "hyundai_authorized_prices_2026",
    "43_9": "kia_rio_price_2017",
    "29_14": "ford_historical_prices",
    "29_13": "ford_historical_prices",
    "29_4": "ford_historical_prices",
    "29_28": "ford_mustang_import_price_2026",
    "29_5": "ford_import_values",
    "29_9": "ford_prices_2026",
    "62_15": "mitsubishi_mirage_price_2018",
    "62_7": "mitsubishi_eclipse_price_reference",
    "64_41": "nissan_historical_prices",
    "64_14": "nissan_historical_prices",
    "64_19": "nissan_tax_values",
}


PRICE_AS_OF_OVERRIDES = {
    "92_44": "2023-11-01",
    "92_30": "2026-01-01",
    "92_34": "2026-09-01",
    "34_11": "2020-08-01",
    "34_1": "2024-04-01",
    "57_13": "2024-08-16",
    "57_5": "2026-09-03",
    "43_9": "2017-11-21",
    "29_14": "2018-01-01",
    "29_13": "2018-01-01",
    "29_4": "2021-11-01",
    "29_5": "2022-01-01",
    "62_15": "2018-10-01",
    "62_7": "2026-09-01",
    "64_41": "2020-06-01",
    "64_14": "2015-01-21",
    "64_19": "2019-04-01",
}


def normalized_rows(path: Path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            yield {(key or "").strip(): (value or "").strip() for key, value in row.items()}


def mode(counter: Counter[str]):
    return counter.most_common(1)[0][0] if counter else None


def as_int(value: str | None):
    if not value:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
    return int(float(match.group())) if match else None


def sql_text(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


BODY_TYPE_EN = {
    "Hatchback": "hatchback",
    "SUV": "SUV",
    "Pickup": "pickup truck",
    "Saloon": "sedan",
    "MPV": "MPV",
    "Coupe": "coupe",
    "Convertible": "convertible",
    "Estate": "wagon",
}


MARKET_STATUS_EN = {
    "official_current": "The model is currently listed by an official or manufacturer-backed source in Vietnam.",
    "official_historical": "The model was officially present in Vietnam, but current pricing and configurations may no longer be published.",
    "present_via_import": "The model is present in Vietnam through referenced or import channels, so specifications may vary by vehicle.",
}


MODEL_INTRO_VI = {
    "92_44": "Toyota Yaris là dòng xe cỡ nhỏ hướng đến nhu cầu di chuyển đô thị, nổi bật với kiểu dáng gọn và cách sử dụng thực dụng.",
    "92_30": "Toyota Prius là dòng xe hybrid tiêu biểu của Toyota, được phát triển với trọng tâm là hiệu quả nhiên liệu và giảm phát thải.",
    "92_34": "Toyota RAV4 là mẫu crossover/SUV dành cho gia đình, kết hợp không gian sử dụng linh hoạt với khả năng vận hành đa mục đích.",
    "92_19": "Toyota Hilux là mẫu bán tải phục vụ cả công việc và di chuyển cá nhân, với thùng hàng và cấu hình phù hợp nhiều điều kiện sử dụng.",
    "92_21": "Toyota Land Cruiser là dòng SUV cỡ lớn nổi tiếng với định hướng bền bỉ, khả năng đi địa hình và không gian cho hành trình dài.",
    "92_11": "Toyota Corolla là dòng xe gia đình cỡ nhỏ phổ biến toàn cầu, có nhiều kiểu thân xe và cấu hình tùy theo từng thị trường.",
    "92_2": "Toyota Alphard là mẫu MPV cao cấp, tập trung vào không gian hành khách, sự tiện nghi và trải nghiệm di chuyển đường dài.",
    "92_9": "Toyota Camry là mẫu sedan hạng trung hướng đến khách hàng gia đình và doanh nghiệp, ưu tiên sự thoải mái và tính thực dụng.",
    "34_3": "Honda CR-V là mẫu crossover/SUV dành cho gia đình, cung cấp không gian linh hoạt và nhiều lựa chọn phiên bản tại Việt Nam.",
    "34_11": "Honda Jazz là mẫu hatchback cỡ nhỏ có khoang nội thất linh hoạt, phù hợp nhu cầu đi lại hằng ngày trong đô thị.",
    "34_2": "Honda Civic là mẫu sedan hạng C theo định hướng thể thao, kết hợp khả năng sử dụng hằng ngày với trải nghiệm lái linh hoạt.",
    "34_8": "Honda HR-V là mẫu SUV đô thị cỡ nhỏ, hướng đến người dùng cần kích thước gọn, vị trí ngồi cao và không gian đa dụng.",
    "34_1": "Honda Accord là mẫu sedan hạng trung, được định vị cho nhu cầu di chuyển gia đình và công việc với không gian rộng rãi.",
    "57_10": "Mazda2 là dòng xe cỡ B dành cho đô thị, có thiết kế nhỏ gọn và được cung cấp dưới dạng sedan hoặc hatchback tùy phiên bản.",
    "57_11": "Mazda3 là dòng xe hạng C gồm biến thể sedan và hatchback, hướng đến thiết kế hiện đại và trải nghiệm lái cân bằng.",
    "57_13": "Mazda6 là mẫu sedan hạng trung, nhấn mạnh thiết kế thanh lịch, không gian sử dụng và sự thoải mái trên hành trình dài.",
    "57_6": "Mazda CX-3 là mẫu SUV đô thị cỡ nhỏ, phù hợp người dùng cần một chiếc xe gọn cho thành phố nhưng có không gian linh hoạt hơn sedan.",
    "57_7": "Mazda CX-5 là mẫu crossover/SUV dành cho gia đình, cân bằng giữa kích thước, tiện nghi và khả năng sử dụng hằng ngày.",
    "57_5": "Mazda BT-50 là mẫu bán tải phục vụ nhu cầu chở hàng, công việc và di chuyển đa địa hình.",
    "36_8": "Hyundai Grand i10 là dòng xe đô thị cỡ nhỏ, phù hợp nhu cầu đi lại cá nhân, gia đình nhỏ và vận hành trong đường phố đông đúc.",
    "36_20": "Hyundai Santa Fe là mẫu SUV dành cho gia đình, hướng đến không gian nhiều hàng ghế và các chuyến đi đường dài.",
    "36_24": "Hyundai Tucson là mẫu crossover/SUV hạng C, phục vụ nhu cầu gia đình với không gian thực dụng và kiểu dáng hiện đại.",
    "36_1": "Hyundai Accent là mẫu sedan cỡ B, hướng đến nhu cầu đi lại hằng ngày với kích thước phù hợp môi trường đô thị.",
    "36_4": "Hyundai Elantra là mẫu sedan hạng C, kết hợp không gian gia đình với thiết kế và khả năng vận hành thiên về sự linh hoạt.",
    "43_9": "Kia Rio là dòng xe cỡ B từng được cung cấp tại Việt Nam, phù hợp nhu cầu sử dụng đô thị và gia đình nhỏ.",
    "43_7": "Kia Morning, còn được biết đến với tên Picanto ở một số thị trường, là mẫu hatchback đô thị cỡ nhỏ.",
    "43_13": "Kia Sportage là mẫu crossover/SUV hạng C dành cho gia đình, cung cấp không gian đa dụng và vị trí ngồi cao.",
    "43_11": "Kia Sorento là mẫu SUV gia đình nhiều hàng ghế, hướng đến nhu cầu chở nhiều người và di chuyển đường dài.",
    "43_1": "Kia Carens là mẫu xe gia đình đa dụng, chú trọng không gian hành khách và khả năng bố trí chỗ ngồi linh hoạt.",
    "43_6": "Kia K5, trước đây được biết đến tại một số thị trường với tên Optima, là mẫu sedan hạng trung của Kia.",
    "43_10": "Kia Carnival, kế nhiệm tên gọi Sedona tại Việt Nam, là mẫu MPV cỡ lớn tập trung vào không gian và tiện nghi cho gia đình.",
    "43_3": "Kia K3, từng mang tên Cerato, là mẫu sedan hạng C phục vụ nhu cầu di chuyển hằng ngày và gia đình.",
    "29_14": "Ford Focus là dòng xe hạng C từng được Ford phân phối với nhiều kiểu thân xe, hướng đến khả năng sử dụng linh hoạt.",
    "29_13": "Ford Fiesta là dòng xe cỡ B từng xuất hiện tại Việt Nam, có kích thước phù hợp giao thông đô thị.",
    "29_4": "Ford EcoSport là mẫu SUV đô thị cỡ nhỏ từng được phân phối tại Việt Nam, phù hợp nhu cầu di chuyển hằng ngày.",
    "29_30": "Ford Ranger là mẫu bán tải đa dụng, phục vụ cả công việc, gia đình và các hành trình ngoài đô thị.",
    "29_28": "Ford Mustang là dòng coupe thể thao mang tính biểu tượng của Ford, hiện diện tại Việt Nam chủ yếu qua đường nhập khẩu.",
    "29_5": "Ford Edge là mẫu crossover/SUV hạng trung dành cho gia đình, hiện diện tại Việt Nam chủ yếu qua xe nhập khẩu.",
    "29_9": "Ford Explorer là mẫu SUV cỡ lớn nhiều chỗ ngồi, hướng đến gia đình cần không gian rộng cho hành khách và hành lý.",
    "62_16": "Mitsubishi Outlander là mẫu crossover/SUV gia đình, được định vị cho nhu cầu di chuyển nhiều người và sử dụng đa mục đích.",
    "62_15": "Mitsubishi Mirage là mẫu hatchback cỡ nhỏ từng được bán tại Việt Nam, tập trung vào khả năng vận hành trong đô thị.",
    "62_7": "Mitsubishi Eclipse Cross là mẫu crossover theo phong cách thể thao, từng xuất hiện trong các nguồn lịch sử của Mitsubishi.",
    "62_20": "Mitsubishi Pajero Sport, còn có tên Shogun Sport tại một số thị trường, là mẫu SUV khung gầm rời dành cho gia đình và hành trình đa địa hình.",
    "64_41": "Nissan X-Trail là mẫu crossover/SUV gia đình từng được phân phối tại Việt Nam, chú trọng không gian và tính đa dụng.",
    "64_20": "Nissan Navara là mẫu bán tải phục vụ công việc và nhu cầu cá nhân, với cấu hình phù hợp đường trường và điều kiện sử dụng đa dạng.",
    "64_3": "Nissan Almera là mẫu sedan cỡ B dành cho nhu cầu đi lại hằng ngày, gia đình nhỏ và môi trường đô thị.",
    "64_14": "Nissan Juke là mẫu crossover đô thị cỡ nhỏ với thiết kế khác biệt, từng hiện diện trong danh mục Nissan tại Việt Nam.",
    "64_19": "Nissan Murano là mẫu crossover hạng trung hướng đến sự thoải mái và không gian cho gia đình, từng xuất hiện tại thị trường Việt Nam.",
    "87_10": "Suzuki Swift là mẫu hatchback đô thị cỡ nhỏ, hướng đến khả năng vận hành linh hoạt và nhu cầu sử dụng hằng ngày.",
    "87_6": "Suzuki Jimny là mẫu SUV cỡ nhỏ có định hướng địa hình, nổi bật với kích thước gọn và thiết kế vuông vức.",
}


def format_vnd(value: int) -> str:
    return "VND " + f"{value:,}"


def build_description(car: dict) -> str:
    body_type = BODY_TYPE_EN.get(car.get("body_type"), "passenger vehicle")
    seats = f" with {car['seats']} seats" if car.get("seats") else ""
    article = "an" if body_type in {"SUV", "MPV"} else "a"
    overview = f"{car['display_name']} is {article} {body_type}{seats} from {car['brand']}."
    market = MARKET_STATUS_EN.get(
        car["market_status_vn"],
        "The model is recorded as present in Vietnam by the dataset's referenced source.",
    )
    price = ""
    if car.get("price_vnd_from"):
        price = (
            f" The dataset records a reference starting price of {format_vnd(car['price_vnd_from'])}"
            f" as of {car['price_as_of']}."
        )
    return overview + " " + market + price


def main() -> None:
    selected = {row[0]: row for row in SELECTED}
    if len(selected) != 50:
        raise RuntimeError(f"Expected 50 unique models, got {len(selected)}")

    basic = {r["Genmodel_ID"]: r for r in normalized_rows(TABLES / "Basic_table.csv")}
    missing_ids = sorted(set(selected) - set(basic))
    if missing_ids:
        raise RuntimeError(f"Unknown Genmodel_ID values: {missing_ids}")

    stats = defaultdict(lambda: defaultdict(Counter))
    ad_years = defaultdict(list)
    for row in normalized_rows(TABLES / "Ad_table (extra).csv"):
        gid = row.get("Genmodel_ID")
        if gid not in selected:
            continue
        for key in ["Bodytype", "Fuel_type", "Gearbox", "Seat_num", "Engin_size", "Wheelbase", "Height", "Width", "Length", "Average_mpg", "Engine_power"]:
            if row.get(key):
                stats[gid][key][row[key]] += 1
        if as_int(row.get("Reg_year")):
            ad_years[gid].append(as_int(row["Reg_year"]))

    latest_price = {}
    for row in normalized_rows(TABLES / "Price_table.csv"):
        gid = row.get("Genmodel_ID")
        if gid not in selected:
            continue
        year = as_int(row.get("Year")) or 0
        price = as_int(row.get("Entry_price"))
        if gid not in latest_price or year > latest_price[gid][0]:
            latest_price[gid] = (year, price)

    image_count = Counter()
    image_samples = defaultdict(list)
    for row in normalized_rows(TABLES / "Image_table.csv"):
        gid = row.get("Genmodel_ID")
        if gid not in selected:
            continue
        image_count[gid] += 1
        if len(image_samples[gid]) >= 5:
            continue
        name = row["Image_name"]
        parts = name.split("$$")
        if len(parts) < 3:
            continue
        candidate = IMAGES_ROOT / parts[0] / parts[2] / name
        if candidate.exists():
            image_samples[gid].append({
                "image_id": row["Image_ID"],
                "image_path": candidate.relative_to(ROOT).as_posix(),
                "view_type": row.get("Predicted_viewpoint") or None,
            })

    cars = []
    for gid, display_name, market_status, source_id, price_vnd in SELECTED:
        raw = basic[gid]
        fields = stats[gid]
        warranty = BRAND_WARRANTIES.get(raw["Automaker"])
        dimensions = {
            "length_mm": as_int(mode(fields["Length"])),
            "width_mm": as_int(mode(fields["Width"])),
            "height_mm": as_int(mode(fields["Height"])),
            "wheelbase_mm": as_int(mode(fields["Wheelbase"])),
        }
        car = {
            "car_id": f"car_{gid.replace('_', '_')}",
            "genmodel_id": gid,
            "brand": raw["Automaker"],
            "source_model_name": raw["Genmodel"],
            "display_name": display_name,
            "aliases": ALIASES.get(gid, [raw["Genmodel"]]),
            "market_status_vn": market_status,
            "presence_source_id": source_id,
            "price_vnd_from": price_vnd,
            "price_as_of": PRICE_AS_OF_OVERRIDES.get(gid, AS_OF) if price_vnd else None,
            "price_source_id": PRICE_SOURCE_OVERRIDES.get(gid, source_id) if price_vnd else None,
            "body_type": mode(fields["Bodytype"]),
            "fuel_type": mode(fields["Fuel_type"]),
            "transmission": mode(fields["Gearbox"]),
            "seats": as_int(mode(fields["Seat_num"])),
            "engine": mode(fields["Engin_size"]),
            "engine_power_hp": as_int(mode(fields["Engine_power"])),
            "fuel_consumption_source_mpg": mode(fields["Average_mpg"]),
            "dimensions": dimensions,
            "source_year_min": min(ad_years[gid]) if ad_years[gid] else None,
            "source_year_max": max(ad_years[gid]) if ad_years[gid] else None,
            "dvm_latest_entry_price_gbp": latest_price.get(gid, (None, None))[1],
            "dvm_price_year": latest_price.get(gid, (None, None))[0],
            "image_count_in_table": image_count[gid],
            "verified_image_count": len(image_samples[gid]),
            "warranty": warranty,
            "data_notes": "Technical values are representative modes from historical UK DVM-CAR ads; verify the exact Vietnam version before answering version-specific questions.",
            "updated_at": AS_OF,
        }
        overrides = SPEC_OVERRIDES.get(gid, {})
        if (car["engine_power_hp"] is None or car["engine_power_hp"] <= 0) and overrides.get("engine_power_hp") is not None:
            car["engine_power_hp"] = overrides["engine_power_hp"]
        for dimension_key in ["length_mm", "width_mm", "height_mm", "wheelbase_mm"]:
            if (car["dimensions"][dimension_key] is None or car["dimensions"][dimension_key] <= 0) and overrides.get(dimension_key) is not None:
                car["dimensions"][dimension_key] = overrides[dimension_key]
        car["description"] = build_description(car)
        missing = []
        for key in ["price_vnd_from", "body_type", "fuel_type", "transmission", "seats", "engine", "engine_power_hp", "warranty"]:
            if car[key] is None or (isinstance(car[key], (int, float)) and car[key] <= 0):
                missing.append(key)
        if any(value is None or value <= 0 for value in dimensions.values()):
            missing.append("dimensions")
        if len(image_samples[gid]) < 5:
            missing.append("minimum_5_verified_images")
        car["missing_fields"] = missing
        cars.append(car)

    OUTPUT.mkdir(parents=True, exist_ok=True)
    DATABASE.mkdir(parents=True, exist_ok=True)

    with (OUTPUT / "cars.json").open("w", encoding="utf-8") as handle:
        json.dump(cars, handle, ensure_ascii=False, indent=2)

    columns = [
        "car_id", "genmodel_id", "brand", "source_model_name", "display_name", "description",
        "market_status_vn", "body_type", "fuel_type", "transmission", "seats",
        "engine", "price_vnd_from", "price_as_of", "image_count_in_table",
        "verified_image_count", "presence_source_id", "missing_fields",
    ]
    with (OUTPUT / "candidate_models.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for car in cars:
            row = {key: car.get(key) for key in columns}
            row["missing_fields"] = "|".join(car["missing_fields"])
            writer.writerow(row)

    with (OUTPUT / "images_manifest.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        columns = ["image_id", "car_id", "genmodel_id", "image_path", "view_type", "exists"]
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for car in cars:
            gid = car["genmodel_id"]
            for image in image_samples[gid]:
                writer.writerow({**image, "car_id": car["car_id"], "genmodel_id": gid, "exists": True})

    with (OUTPUT / "sources.jsonl").open("w", encoding="utf-8") as handle:
        for source in SOURCES:
            handle.write(json.dumps({**source, "checked_at": AS_OF}, ensure_ascii=False) + "\n")

    missing_summary = Counter(field for car in cars for field in car["missing_fields"])
    quality_report = {
        "generated_at": AS_OF,
        "car_count": len(cars),
        "unique_genmodel_id_count": len({car["genmodel_id"] for car in cars}),
        "brand_count": len({car["brand"] for car in cars}),
        "verified_image_count": sum(len(items) for items in image_samples.values()),
        "models_with_at_least_5_verified_images": sum(len(image_samples[car["genmodel_id"]]) >= 5 for car in cars),
        "models_below_5_verified_images": [
            {"car_id": car["car_id"], "display_name": car["display_name"], "verified_images": car["verified_image_count"]}
            for car in cars if car["verified_image_count"] < 5
        ],
        "models_with_verified_vn_price": sum(car["price_vnd_from"] is not None for car in cars),
        "missing_field_counts": dict(sorted(missing_summary.items())),
    }
    with (OUTPUT / "quality_report.json").open("w", encoding="utf-8") as handle:
        json.dump(quality_report, handle, ensure_ascii=False, indent=2)

    seed_lines = ["-- Generated by scripts/build_dataset.py; UTF-8.", "BEGIN;"]
    for car in cars:
        dims = car["dimensions"]
        warranty = car["warranty"] or {}
        seed_lines.append(
            "INSERT INTO cars (car_id, genmodel_id, brand_name, source_model_name, display_name, description, aliases, "
            "market_status_vn, body_type, fuel_type, transmission, seats, engine, engine_power_hp, "
            "length_mm, width_mm, height_mm, wheelbase_mm, price_vnd_from, price_as_of, price_source_id, "
            "warranty_months, warranty_distance_km, presence_source_id, missing_fields, image_count, updated_at) VALUES ("
            + ", ".join([
                sql_text(car["car_id"]), sql_text(car["genmodel_id"]), sql_text(car["brand"]),
                sql_text(car["source_model_name"]), sql_text(car["display_name"]),
                sql_text(car["description"]), sql_text(json.dumps(car["aliases"], ensure_ascii=False)), sql_text(car["market_status_vn"]),
                sql_text(car["body_type"]), sql_text(car["fuel_type"]), sql_text(car["transmission"]),
                str(car["seats"]) if car["seats"] is not None else "NULL", sql_text(car["engine"]),
                str(car["engine_power_hp"]) if car["engine_power_hp"] is not None else "NULL",
                str(dims["length_mm"]) if dims["length_mm"] is not None else "NULL",
                str(dims["width_mm"]) if dims["width_mm"] is not None else "NULL",
                str(dims["height_mm"]) if dims["height_mm"] is not None else "NULL",
                str(dims["wheelbase_mm"]) if dims["wheelbase_mm"] is not None else "NULL",
                str(car["price_vnd_from"]) if car["price_vnd_from"] is not None else "NULL",
                sql_text(car["price_as_of"]),
                sql_text(car["price_source_id"]),
                str(warranty.get("duration_months")) if warranty.get("duration_months") else "NULL",
                str(warranty.get("distance_km")) if warranty.get("distance_km") else "NULL",
                sql_text(car["presence_source_id"]), sql_text(json.dumps(car["missing_fields"], ensure_ascii=False)),
                str(car["verified_image_count"]), sql_text(car["updated_at"]),
            ]) + ") ON CONFLICT (car_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;"
        )
        for image in image_samples[car["genmodel_id"]]:
            seed_lines.append(
                "INSERT INTO car_images (image_id, car_id, image_path, view_type) VALUES ("
                + ", ".join([sql_text(image["image_id"]), sql_text(car["car_id"]), sql_text(image["image_path"]), sql_text(image["view_type"])])
                + ") ON CONFLICT (image_id) DO NOTHING;"
            )
    for source in SOURCES:
        seed_lines.append(
            "INSERT INTO sources (source_id, title, url, source_type, supports, checked_at) VALUES ("
            + ", ".join([sql_text(source["source_id"]), sql_text(source["title"]), sql_text(source["url"]), sql_text(source["source_type"]), sql_text(source["supports"]), sql_text(AS_OF)])
            + ") ON CONFLICT (source_id) DO UPDATE SET checked_at = EXCLUDED.checked_at;"
        )
    for brand, warranty in BRAND_WARRANTIES.items():
        seed_lines.append(
            "INSERT INTO warranties (brand_name, duration_months, distance_limit_km, conditions, source_id) SELECT "
            + ", ".join([
                sql_text(brand), str(warranty["duration_months"]), str(warranty["distance_km"]),
                sql_text(warranty["conditions"]), sql_text(warranty["source_id"]),
            ])
            + " WHERE NOT EXISTS (SELECT 1 FROM warranties WHERE car_id IS NULL AND brand_name = "
            + sql_text(brand) + " AND source_id = " + sql_text(warranty["source_id"]) + ");"
        )
    for dealer in DEALERS:
        seed_lines.append(
            "INSERT INTO dealers (name, address, city, phone, website, supported_brands, source_id, checked_at) VALUES ("
            + ", ".join([
                sql_text(dealer["name"]), sql_text(dealer["address"]), sql_text(dealer["city"]),
                sql_text(dealer["phone"]), sql_text(dealer["website"]),
                sql_text(json.dumps([dealer["brand"]], ensure_ascii=False)) + "::jsonb",
                sql_text(dealer["source_id"]), sql_text(AS_OF),
            ])
            + ") ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address, city = EXCLUDED.city, phone = EXCLUDED.phone, "
            "website = EXCLUDED.website, supported_brands = EXCLUDED.supported_brands, "
            "source_id = EXCLUDED.source_id, checked_at = EXCLUDED.checked_at;"
        )
    seed_lines.extend(["COMMIT;", ""])
    (DATABASE / "seed.sql").write_text("\n".join(seed_lines), encoding="utf-8")

    description_lines = [
        "-- Generated by scripts/build_dataset.py; safe to run repeatedly.",
        "BEGIN;",
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cars' AND column_name = 'display_name_vi') "
        "AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cars' AND column_name = 'display_name') "
        "THEN ALTER TABLE cars RENAME COLUMN display_name_vi TO display_name; END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cars' AND column_name = 'description_vi') "
        "AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cars' AND column_name = 'description') "
        "THEN ALTER TABLE cars RENAME COLUMN description_vi TO description; END IF; END $$;",
        "ALTER TABLE cars ADD COLUMN IF NOT EXISTS description text;",
    ]
    for car in cars:
        description_lines.append(
            "UPDATE cars SET description = " + sql_text(car["description"])
            + " WHERE car_id = " + sql_text(car["car_id"]) + ";"
        )
    description_lines.extend([
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM cars) AND EXISTS (SELECT 1 FROM cars WHERE description IS NULL OR btrim(description) = '') THEN RAISE EXCEPTION 'Some cars are missing descriptions'; END IF; END $$;",
        "ALTER TABLE cars ALTER COLUMN description SET NOT NULL;",
        "COMMIT;",
        "",
    ])
    (DATABASE / "002_add_descriptions.sql").write_text("\n".join(description_lines), encoding="utf-8")

    enrichment_lines = [
        "-- Generated by scripts/build_dataset.py; fills sourced prices/specifications and brand warranty policies.",
        "BEGIN;",
        "ALTER TABLE cars ADD COLUMN IF NOT EXISTS price_source_id text REFERENCES sources(source_id) DEFERRABLE INITIALLY DEFERRED;",
    ]
    for source in SOURCES:
        enrichment_lines.append(
            "INSERT INTO sources (source_id, title, url, source_type, supports, checked_at) VALUES ("
            + ", ".join([sql_text(source["source_id"]), sql_text(source["title"]), sql_text(source["url"]), sql_text(source["source_type"]), sql_text(source["supports"]), sql_text(AS_OF)])
            + ") ON CONFLICT (source_id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, source_type = EXCLUDED.source_type, supports = EXCLUDED.supports, checked_at = EXCLUDED.checked_at;"
        )
    for car in cars:
        dims = car["dimensions"]
        warranty = car["warranty"] or {}
        enrichment_lines.append(
            "UPDATE cars SET market_status_vn = " + sql_text(car["market_status_vn"])
            + ", price_vnd_from = " + (str(car["price_vnd_from"]) if car["price_vnd_from"] is not None else "price_vnd_from")
            + ", price_as_of = " + (sql_text(car["price_as_of"]) if car["price_as_of"] is not None else "price_as_of")
            + ", price_source_id = " + (sql_text(car["price_source_id"]) if car["price_source_id"] is not None else "price_source_id")
            + ", engine_power_hp = " + (str(car["engine_power_hp"]) if car["engine_power_hp"] is not None else "engine_power_hp")
            + ", length_mm = " + (str(dims["length_mm"]) if dims["length_mm"] is not None else "length_mm")
            + ", width_mm = " + (str(dims["width_mm"]) if dims["width_mm"] is not None else "width_mm")
            + ", height_mm = " + (str(dims["height_mm"]) if dims["height_mm"] is not None else "height_mm")
            + ", wheelbase_mm = " + (str(dims["wheelbase_mm"]) if dims["wheelbase_mm"] is not None else "wheelbase_mm")
            + ", warranty_months = " + (str(warranty.get("duration_months")) if warranty.get("duration_months") else "warranty_months")
            + ", warranty_distance_km = " + (str(warranty.get("distance_km")) if warranty.get("distance_km") else "warranty_distance_km")
            + ", missing_fields = " + sql_text(json.dumps(car["missing_fields"], ensure_ascii=False)) + "::jsonb"
            + ", description = " + sql_text(car["description"])
            + ", updated_at = " + sql_text(AS_OF)
            + " WHERE car_id = " + sql_text(car["car_id"]) + ";"
        )
    for brand, warranty in BRAND_WARRANTIES.items():
        enrichment_lines.append(
            "INSERT INTO warranties (brand_name, duration_months, distance_limit_km, conditions, source_id) SELECT "
            + ", ".join([
                sql_text(brand), str(warranty["duration_months"]), str(warranty["distance_km"]),
                sql_text(warranty["conditions"]), sql_text(warranty["source_id"]),
            ])
            + " WHERE NOT EXISTS (SELECT 1 FROM warranties WHERE car_id IS NULL AND brand_name = "
            + sql_text(brand) + " AND source_id = " + sql_text(warranty["source_id"]) + ");"
        )
    enrichment_lines.extend(["COMMIT;", ""])
    (DATABASE / "003_enrich_missing_data.sql").write_text("\n".join(enrichment_lines), encoding="utf-8")

    dealer_lines = [
        "-- Generated by scripts/build_dataset.py; adds sourced authorized-dealer records.",
        "BEGIN;",
        "ALTER TABLE dealers ADD COLUMN IF NOT EXISTS source_id text REFERENCES sources(source_id) DEFERRABLE INITIALLY DEFERRED;",
        "ALTER TABLE dealers ADD COLUMN IF NOT EXISTS checked_at date;",
        "UPDATE dealers SET checked_at = " + sql_text(AS_OF) + " WHERE checked_at IS NULL;",
        "ALTER TABLE dealers ALTER COLUMN checked_at SET NOT NULL;",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_dealers_name_address ON dealers (name, address);",
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_dealers_name ON dealers (name);",
        "CREATE INDEX IF NOT EXISTS ix_dealers_city ON dealers (city);",
    ]
    for source in DEALER_SOURCES:
        dealer_lines.append(
            "INSERT INTO sources (source_id, title, url, source_type, supports, checked_at) VALUES ("
            + ", ".join([sql_text(source["source_id"]), sql_text(source["title"]), sql_text(source["url"]), sql_text(source["source_type"]), sql_text(source["supports"]), sql_text(AS_OF)])
            + ") ON CONFLICT (source_id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, source_type = EXCLUDED.source_type, supports = EXCLUDED.supports, checked_at = EXCLUDED.checked_at;"
        )
    for dealer in DEALERS:
        dealer_lines.append(
            "INSERT INTO dealers (name, address, city, phone, website, supported_brands, source_id, checked_at) VALUES ("
            + ", ".join([
                sql_text(dealer["name"]), sql_text(dealer["address"]), sql_text(dealer["city"]),
                sql_text(dealer["phone"]), sql_text(dealer["website"]),
                sql_text(json.dumps([dealer["brand"]], ensure_ascii=False)) + "::jsonb",
                sql_text(dealer["source_id"]), sql_text(AS_OF),
            ])
            + ") ON CONFLICT (name) DO UPDATE SET address = EXCLUDED.address, city = EXCLUDED.city, phone = EXCLUDED.phone, "
            "website = EXCLUDED.website, supported_brands = EXCLUDED.supported_brands, "
            "source_id = EXCLUDED.source_id, checked_at = EXCLUDED.checked_at;"
        )
    dealer_lines.extend([
        "DO $$ BEGIN IF (SELECT COUNT(*) FROM dealers) < " + str(len(DEALERS)) + " THEN RAISE EXCEPTION 'Dealer seed is incomplete'; END IF; END $$;",
        "COMMIT;",
        "",
    ])
    (DATABASE / "004_seed_dealers.sql").write_text("\n".join(dealer_lines), encoding="utf-8")

    valid_images = sum(len(items) for items in image_samples.values())
    print(f"Generated {len(cars)} cars, {valid_images} verified image rows, {len(DEALERS)} dealers and {len(SOURCES)} sources.")
    print(f"Output directory: {OUTPUT}")


if __name__ == "__main__":
    main()
