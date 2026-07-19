# Third-party notices

LeRobot Lens bundles the following third-party materials for its offline sample mode.

## hachimada/so101_pick_place_red_1

- Source: https://huggingface.co/datasets/hachimada/so101_pick_place_red_1
- Author: hachimada
- License: Apache License 2.0
- Bundled material: Episode 0 state values, actions, timestamps, and front-camera observations
- Modifications: selected Episode 0 only; converted its video segment into individual JPEG frames for local playback

The dataset author has also explicitly confirmed permission for this inclusion in the LeRobot Lens project.

## TheRobotStudio/SO-ARM100

- Source: https://github.com/TheRobotStudio/SO-ARM100
- Copyright and authorship: TheRobotStudio/SO-ARM100 contributors
- License: Apache License 2.0
- Bundled material: `Simulation/SO101/so101_new_calib.urdf` and the 13 STL meshes referenced by that URDF
- Modifications: copied without geometric modification; relocated under LeRobot Lens's SO-101 robot asset directory

The full Apache License 2.0 text distributed with SO-ARM100 is included at
`backend/src/lerobot_lens/resources/robots/so101/LICENSE`. The source dataset card is included at
`backend/src/lerobot_lens/resources/demo/DATASET_CARD.md`.
