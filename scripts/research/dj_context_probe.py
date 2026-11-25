"""Reproduce the case study from the original project's checkpoint and example MP3.

Install the upstream model dependencies and matplotlib, then run
python dj_context_probe.py /path/to/Structure_Aware_DJ_Transition /path/to/output
with upstream revision d6df1fe5c57185a5bed64b5f9494c165c2d38054.
The published trace used Python 3.12, torch 2.8.0 (CPU) and librosa 1.0.1.
"""

import argparse
import csv
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, ListedColormap
import numpy as np
import torch

CLASSES = ("Intro", "Verse", "Chorus", "Outro")
COLORS = ("#886f9a", "#24766b", "#cb652e", "#446ba0")
LOOKAHEADS = (0, 1, 2, 4, 8, 16, 32)
INK = "#28352f"
PAPER = "#fcfbf8"


def run_checkpoint(repo):
    sys.path.insert(0, str(repo.resolve()))
    from spectrogram import extract_energy_features
    from train_cnn_lstm import CnnLstm, predict

    torch.set_num_threads(1)
    song = str(repo / "song_playlist" / "Baby - Justin Bieber.mp3")
    features = extract_energy_features(song)
    with np.load(repo / "cnn_lstm_stats.npz") as stats:
        inputs = torch.tensor((features - stats["mean"]) / stats["std"], dtype=torch.float32)
    model = CnnLstm().eval()
    model.load_state_dict(torch.load(repo / "cnn_lstm_best.pt", weights_only=True, map_location="cpu"))

    with torch.inference_mode():
        scores = model(inputs[None])[0].softmax(dim=-1).numpy()
        prefixes = []
        for future in LOOKAHEADS:
            labels = []
            for t in range(len(inputs)):
                end = min(t + future + 1, len(inputs))
                labels.append(model(inputs[None, :end])[0, t].argmax().item())
            prefixes.append(labels)
    final = predict(song) - 1  # upstream class IDs start at one
    return features, scores, final, np.array(prefixes)


def style_axis(ax):
    ax.set_facecolor(PAPER)
    ax.tick_params(length=0, colors=INK, pad=5)
    for spine in ax.spines.values():
        spine.set_visible(False)


def draw_figures(directory, features, scores, final, prefixes):
    plt.rcParams.update({"font.size": 11, "text.color": INK, "figure.facecolor": PAPER})
    cmap = LinearSegmentedColormap.from_list("signal", ["#eff3e9", "#a5c9b5", "#478777", "#183e41"])
    n = len(features)
    ticks = np.arange(0, n, 30)
    fig = plt.figure(figsize=(7.6, 4.8))
    fig.subplots_adjust(left=.16, right=.98, top=.86, bottom=.19)
    grid = fig.add_gridspec(2, 1, height_ratios=[1.3, 1], hspace=.63)
    a = fig.add_subplot(grid[0])
    a.imshow(features.T, cmap=cmap, interpolation="nearest", aspect="auto",
             extent=(0, n, 39, 0), vmin=0, vmax=1)
    a.set_title("Acoustic features", loc="left", fontweight="bold", fontsize=14, pad=8)
    a.set_yticks([2.5, 11.5, 24, 34.5, 38], ["Bands", "MFCC", "Chroma", "Contrast", "Other"], fontsize=9)
    for y in [5, 18, 30, 36]:
        a.axhline(y, color=PAPER, lw=.7)
    a.set_xticks([])
    style_axis(a)
    b = fig.add_subplot(grid[1], sharex=a)
    for k, (color, label) in enumerate(zip(COLORS, CLASSES)):
        b.plot(np.arange(n)+.5, scores[:, k], color=color, lw=1.6, label=label)
    b.set_title("Section probabilities", loc="left", fontweight="bold", fontsize=14, pad=8)
    b.set(xlim=(0,n), ylim=(-.03,1.04), xlabel="Song time (s)")
    b.set_yticks([0,.5,1], ["0", "0.5", "1"])
    b.set_xticks(ticks)
    a.tick_params(labelbottom=False)
    b.grid(axis="y", color="#d3d9cf", lw=.75)
    b.legend(ncols=4, loc="upper center", bbox_to_anchor=(.48,-.43), frameon=False, columnspacing=1.2)
    style_axis(b)
    fig.savefig(directory/"checkpoint-trace.png", dpi=200)
    plt.close(fig)

    # Use a label-free crop of the same data at the much smaller portfolio-card scale.
    fig, axes = plt.subplots(2,1,figsize=(3.2,2.4),gridspec_kw={"height_ratios":[4,1],"hspace":.08})
    fig.subplots_adjust(.03,.08,.97,.92)
    axes[0].imshow(features.T,cmap=cmap,aspect="auto",interpolation="nearest")
    axes[1].imshow(final[None,:],cmap=ListedColormap(COLORS),aspect="auto",interpolation="nearest",vmin=0,vmax=3)
    for ax in axes:
        ax.axis("off")
    fig.savefig(directory/"checkpoint-thumbnail.png",dpi=150)
    plt.close(fig)

    # Trace the exact temporal support of one interior convolution output.
    fig, ax = plt.subplots(figsize=(7.6, 3.2))
    fig.subplots_adjust(left=.29, right=.97, top=.83, bottom=.15)
    rows = [(np.arange(36,43), "Input features"), (np.arange(37,42), "First convolution"),
            (np.array([39]), "Second convolution")]
    for source in range(2):
        width = (3, 5)[source]
        for target in rows[source+1][0]:
            for offset in range(-(width//2), width//2+1):
                ax.plot([target+offset, target], [2-source, 1-source], color="#a5b9aa", lw=1.25)
    for row, (times, _) in enumerate(rows):
        ax.scatter(times, [2-row]*len(times), s=145, color=("#c5dfcc","#67a697","#24685f")[row],
                   edgecolor="#366a5c", linewidth=.8, zorder=3)
    ax.set_yticks([2,1,0],[f"{label}" for _,label in rows])
    ax.set_xticks(range(36,43))
    ax.set(xlim=(35.6,42.4), ylim=(-.3,2.4), xlabel="Feature row (nominal seconds)")
    ax.set_title("Local context for row 39", loc="left", fontsize=14, fontweight="bold", pad=12)
    style_axis(ax)
    fig.savefig(directory/"convolution-context.png", dpi=200)
    plt.close(fig)

    mismatch = prefixes != scores.argmax(axis=1)
    fig, ax = plt.subplots(figsize=(7.6,3.45))
    fig.subplots_adjust(left=.16,right=.84,top=.80,bottom=.22)
    ax.imshow(mismatch, aspect="auto", interpolation="nearest", extent=(0,n,len(LOOKAHEADS)-.5,-.5),
              cmap=ListedColormap(["#e8ede4","#944821"]), vmin=0, vmax=1)
    ax.set_title("Labels changed by limiting future context",loc="left",fontsize=14,fontweight="bold",pad=14)
    ax.set_yticks(range(len(LOOKAHEADS)), [f"{v} s" for v in LOOKAHEADS])
    ax.set_ylabel("Lookahead")
    ax.set_xlabel("Song time (s)")
    ax.set_xticks(ticks)
    for i,total in enumerate(mismatch.sum(axis=1)):
        ax.text(1.025,i,str(total),va="center",transform=ax.get_yaxis_transform(),fontsize=11)
        ax.axhline(i+.5,color=PAPER,lw=2)
    ax.text(1.025,1.04,"Changed",transform=ax.transAxes,fontsize=10)
    style_axis(ax)
    fig.savefig(directory/"lookahead.png", dpi=200)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("upstream", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    features, scores, final, prefixes = run_checkpoint(args.upstream)
    draw_figures(args.output, features, scores, final, prefixes)
    with (args.output/"checkpoint-trace.csv").open("w", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["row", *[f"p_{c.lower()}" for c in CLASSES], "full_raw", "final",
                         *[f"lookahead_{s}s" for s in LOOKAHEADS]])
        for t, p in enumerate(scores):
            writer.writerow([t, *[f"{v:.7f}" for v in p], CLASSES[p.argmax()], CLASSES[final[t]],
                             *[CLASSES[k] for k in prefixes[:,t]]])


if __name__ == "__main__":
    main()
