# Curated AutoWise image dataset

This directory contains only the image subset selected for the 50-car AutoWise dataset.

## Contents

- `images/{car_id}/`: one directory for each of the 50 cars.
- `images_manifest.csv`: 215 exported images and their original source paths.
- `car_image_summary.csv`: image coverage for all 50 cars.
- `missing_images.csv`: cars for which the supplied source corpus contains no matching image.
- `dataset_info.json`: aggregate counts and directory layout.

## Coverage

- Cars in dataset: 50
- Cars with images: 48
- Cars without images: 2
- Exported images: 215

The source corpus has no matching image for Toyota Camry (`car_92_9`) or Suzuki Swift (`car_87_10`). No unrelated model image was substituted.

## Rebuild

From the repository root, while the raw source corpus is still available:

```powershell
python scripts/export_image_dataset.py
```

The exporter refuses to overwrite a non-empty output directory.
