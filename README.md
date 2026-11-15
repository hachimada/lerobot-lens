# LeRobot Lens

[![CI](https://github.com/hachimada/lerobot-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/hachimada/lerobot-lens/actions)
[![codecov](https://codecov.io/gh/hachimada/lerobot-lens/branch/main/graph/badge.svg)](https://codecov.io/gh/hachimada/lerobot-lens)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![LeRobot 0.7+](https://img.shields.io/badge/LeRobot-0.7%2B-FFD21E)](https://github.com/huggingface/lerobot)

LeRobot Lens visualizes how a policy responds to observations from a LeRobot dataset. It compares the resulting action chunks with recorded actions and can replay the motion using a URDF model.

On training data, it helps verify whether the policy can reproduce the demonstrated behavior. On unseen data, it provides a quick qualitative check of whether the policy's response appears reasonable.

![LeRobot Lens screenshot](docs/assets/LeRobotLens.png)

> [!IMPORTANT]
> LeRobot Lens is not a simulator. It does not perform closed-loop rollouts and therefore cannot evaluate grasping, contact, collisions, or task success. It is an offline policy inspection tool for examining responses to recorded observations before testing on a robot or in simulation.

## Features

- Load LeRobot datasets and policies from the Hugging Face Hub or local paths, including local datasets in LeRobot's Lance storage format, and reopen recent sessions in one click
- Play recorded episodes with every camera the policy observes
- Probe a whole episode chunk after chunk, with or without overlap, to find where predictions drift from the demonstration; probes stay on their own track while you play the recording
- Compare each predicted chunk with the recorded actions, with the mean absolute error overall and per joint, or probe any single frame for a quick check
- Compare recorded actions (dashed) with predicted chunks (solid) in one chart per joint, each with its own scale
- Replay predicted motion on a URDF model next to a translucent robot showing the recorded action

## Requirements

- Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Node.js 20+
- ffmpeg

## Quick start

```bash
make install
```

Build the frontend and start the local application:

```bash
make run
```

Open `http://localhost:8000`, then enter local paths or Hugging Face Hub dataset and policy IDs. FastAPI serves both the UI and API from the same port. The first load from the Hub may require additional time and disk space.

You can also select **Try the demo** to explore the bundled sample without downloading external artifacts.

## Usage

1. Enter a dataset and, optionally, a policy checkpoint and a robot model (URDF or a built-in robot). For a robot model, choose whether the dataset stores joint values in degrees or radians. Device and Joint Map are under **Advanced**.
2. Pick an episode from the list. The **Recording** panel under the cameras plays the episode: play, step, or scrub its timeline, or click any joint chart.
3. In the **Probes** panel below it, select **Probe whole episode** to run the policy chunk after chunk across the episode: with no overlap by default, or with consecutive chunks sharing a chosen number of steps (a 50-step chunk with a 10-step overlap probes every 40 frames). Each chunk appears on the probe track, colored by how far it drifts from the recorded actions; overlapping chunks stack in rows. To check a single observation instead, use **Probe frame** (or press `I`) on the current recording frame.
4. Click a chunk on the probe track, or in the list in the **Probe details** panel, to put it on the stage. The chunk player under the track steps or plays through it: the robot model shows the predicted action (solid) next to the recorded action at the same step (translucent), and the joint charts list both with their difference. The cameras hold the frame the policy observed, because actions are commands rather than a record of what the cameras saw. The recording keeps its own position meanwhile; its controls, or the **Recording** switch above the stage, bring it back. **Play all chunks** plays the chunks through the episode, showing at each frame the chunk inferred from the latest observation so far (a chunk starts at the frame the policy observed): a chunk plays until a newer one starts, or to its end if none does, and gaps between chunks are skipped. The chunk player also removes the probe, and **Clear all probes** in the toolbar removes every probe in the episode.
5. Use **Change** in the top bar to switch to another checkpoint or dataset; the current workspace stays open until the new session is ready.

### Keyboard shortcuts

| Key            | Action                                                                               |
| -------------- | ------------------------------------------------------------------------------------ |
| `Space`        | Play or pause                                                                        |
| `←` / `→`      | Previous or next frame (`Shift` jumps 10); chunk steps while a probe is on the stage |
| `Home` / `End` | First or last frame, or chunk step                                                   |
| `Esc`          | Show the recording on the stage                                                      |
| `[` / `]`      | Previous or next episode                                                             |
| `I`            | Probe the policy at the current frame                                                |
| `R`            | Play or pause the selected chunk on the stage                                        |
| `Delete`       | Remove the selected probe                                                            |
| `?`            | Show all shortcuts                                                                   |

Probe colors use the mean absolute error divided by each joint's range in the episode: under 5% is _on track_, under 15% is _drifting_, and above that is _diverging_.

Recorded actions are a reference, not definitive ground truth for policy quality. A difference between recorded and predicted actions does not necessarily indicate failure because multiple actions may be valid for the same observation.

## Joint Map

Use a Joint Map when dataset action names differ from movable joint names in the URDF. Each key is a dataset action name, and its value is the corresponding URDF joint name.

Names that match after removing a `.pos` suffix, such as `shoulder_pan.pos` and `shoulder_pan`, are mapped automatically. Only specify pairs whose names do not match, such as `motor_1.pos` and `shoulder_pan`.

```json
{
  "motor_1.pos": "shoulder_pan",
  "motor_2.pos": "shoulder_lift"
}
```

## Third-party assets

The offline demo includes Episode 0 from [hachimada/so101_pick_place_red_1](https://huggingface.co/datasets/hachimada/so101_pick_place_red_1) and the SO-101 URDF and STL files from [TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100). Both are licensed under the Apache License 2.0.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for redistributed materials, modifications, and license texts.
