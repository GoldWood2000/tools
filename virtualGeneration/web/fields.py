# -*- coding: utf-8 -*-
"""
行驶证字段定义 + 随机数据生成器（测试/样例用途）。

坐标系：以各自模板图左上角为原点，单位像素。
bbox = (x, y, w, h)  覆盖旧字的矩形 + 新字绘制区域。
align: "left" | "center"
"""

import json
import os
import random
import string

_HERE = os.path.dirname(os.path.abspath(__file__))
REGIONS_JSON = os.path.join(_HERE, "regions.json")

# ----------------------------------------------------------------- 随机源

PROVINCES = list("京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼")
PLATE_LETTERS = string.ascii_uppercase.replace("I", "").replace("O", "")
VIN_CHARS = "".join(c for c in (string.ascii_uppercase + string.digits)
                    if c not in "IOQ")

SURNAMES = list("王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭")
GIVEN = list("伟芳娜秀英敏静丽强磊军洋勇艳杰娟涛明超秀霞平刚桂英建华文辉力")

CITIES = ["市辖区", "和平区", "朝阳区", "海淀区", "高新区", "经济开发区",
          "江北区", "南山区", "西湖区", "鼓楼区"]
STREETS = ["人民路", "建设大道", "解放街", "中山路", "长江路", "迎宾大道",
           "学院路", "工业园区", "兴业街", "复兴路"]

VEHICLE_TYPES = ["小型轿车", "小型普通客车", "微型轿车", "中型普通客车",
                 "重型仓栅式货车", "轻型厢式货车", "小型新能源轿车"]
USE_CHARS = ["非营运", "营运", "预约出租客运", "货运"]
BRANDS = ["大众", "丰田", "本田", "日产", "别克", "比亚迪", "吉利", "奇瑞",
          "长安", "东风", "现代", "奥迪", "宝马", "奔驰"]


def random_plate():
    return (random.choice(PROVINCES)
            + random.choice(PLATE_LETTERS)
            + "".join(random.choice(string.digits + PLATE_LETTERS)
                      for _ in range(5)))


def random_name():
    n = random.choice(SURNAMES)
    n += "".join(random.choice(GIVEN) for _ in range(random.randint(1, 2)))
    return n


def random_address():
    return ("某省某市" + random.choice(CITIES)
            + random.choice(STREETS) + str(random.randint(1, 999)) + "号")


def random_vehicle_type():
    return random.choice(VEHICLE_TYPES)


def random_use_char():
    return random.choice(USE_CHARS)


def random_model():
    brand = random.choice(BRANDS)
    code = (random.choice(string.ascii_uppercase) * 3
            + str(random.randint(1000, 9999))
            + random.choice(string.ascii_uppercase) * 2)
    return brand + "牌" + code


def random_vin():
    return "".join(random.choice(VIN_CHARS) for _ in range(17))


def random_engine():
    return "".join(random.choice(string.digits) for _ in range(8))


def random_date(y0=2015, y1=2024):
    y = random.randint(y0, y1)
    m = random.randint(1, 12)
    d = random.randint(1, 28)
    return "%04d-%02d-%02d" % (y, m, d)


def random_file_no():
    return "".join(random.choice(string.digits) for _ in range(12))


def random_mass(lo, hi, step=10):
    return str(random.randrange(lo, hi, step)) + "kg"


def random_dimensions():
    L = random.randrange(3800, 5200, 10)
    W = random.randrange(1600, 2000, 10)
    H = random.randrange(1400, 1900, 10)
    return "%dX%dX%d" % (L, W, H)


def random_inspect_until():
    y = random.randint(2026, 2031)
    m = random.randint(1, 12)
    return str(y), str(m)


# ------------------------------------------------------- 完整随机记录

def random_record(plate=None, owner=None):
    """Build a full field record. plate/owner override the random values."""
    L = random.randrange(3800, 5200, 10)
    W = random.randrange(1600, 2000, 10)
    H = random.randrange(1400, 1900, 10)
    iy, im = random_inspect_until()
    return {
        # 正页
        "plate": plate or random_plate(),
        "vehicle_type": random_vehicle_type(),
        "owner": owner or random_name(),
        "address": random_address(),
        "use_char": random_use_char(),
        "model": random_model(),
        "vin": random_vin(),
        "engine": random_engine(),
        "register_date": random_date(),
        "issue_date": random_date(),
        # 反页
        "file_no": random_file_no(),
        "passengers": str(random.randint(2, 7)) + "人",
        "gross_mass": str(random.randrange(1500, 18000, 10)) + "kg",
        "curb_mass": str(random.randrange(1000, 9000, 10)) + "kg",
        "load_mass": str(random.randrange(0, 8000, 10)) + "kg",
        "dimensions": "%dX%dX%d" % (L, W, H),
        "traction_mass": "0kg",
        "inspect_year": iy,
        "inspect_month": im,
    }


# ------------------------------------------------------- 字段坐标
# region = (x0, y0, x1, y1) 旧值所在的矩形：render 用众数底纹色覆盖该区
# 域隐去旧字，再在区内画新值。坐标存于 regions.json，可用校准页可视化调整。
# 左下角有红色公安印章，相关字段 x0 抬到印章右缘以避开。


def _load_regions():
    with open(REGIONS_JSON, encoding="utf-8") as fh:
        data = json.load(fh)
    # region 列表化为 tuple，保持与旧代码一致
    for side in ("front", "back"):
        for fd in data.get(side, []):
            fd["region"] = tuple(fd["region"])
    return data["front"], data["back"]


FRONT_FIELDS, BACK_FIELDS = _load_regions()


def reload_regions():
    """重新从 regions.json 载入（校准页保存后调用，免重启）。"""
    global FRONT_FIELDS, BACK_FIELDS
    FRONT_FIELDS, BACK_FIELDS = _load_regions()
    return FRONT_FIELDS, BACK_FIELDS
