# Bundled robot assets

This directory contains reusable robot visualization assets. Demo datasets must not be stored here.

Each robot has its own directory:

```text
resources/robots/
└── <robot-id>/
    ├── <robot>.urdf
    ├── assets/        # meshes referenced by the URDF
    ├── README.md      # source and asset notes
    └── LICENSE        # upstream license
```

After adding a robot directory, register its display name and URDF path in
`lerobot_lens/services/robot_catalog.py`.
