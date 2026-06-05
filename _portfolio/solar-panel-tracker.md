---
title: "Autonomous Solar Panel Sun-Tracking System"
excerpt: "Designed and built a sun-tracking structure for a 2.4 kW solar array using Arduino and linear actuators, achieving a 23.2% efficiency gain in prototype testing. Submitted to FEBRACE (Brazilian national science fair)."
collection: portfolio
date: 2023-01-01
---

## Overview

Fixed solar panels leave significant energy on the table because they can only be optimally oriented for a fraction of the day. This project investigated whether an automated sun-tracking system could meaningfully increase daily energy output for a real rooftop installation, and whether the energy consumed by the tracking mechanism would remain negligible compared to the gains.

## Hypothesis

A structure that continuously rotates solar panels to maintain perpendicular alignment with incident sunlight would increase daily energy production. The energy consumed by the actuation motors would be small enough that the net gain would still be significant.

## Prototype

Before scaling to a full installation, a small-scale prototype was built using a single solar panel and a servo motor controlled by an Arduino Uno. Two photoresistors mounted in a custom 3D-printed housing measured differential light intensity on either side of the panel. The Arduino compared both readings every 0.6 seconds and rotated the panel in 2-degree increments until the readings equalized — indicating perpendicular alignment with the sun.

**Prototype result: 23.2% increase in energy production** compared to a fixed-angle panel under identical conditions.

## Full-Scale Implementation

Based on the prototype's success, the system was scaled to a real rooftop installation:

- **Structure:** Custom steel frame supporting 6 × 400 W solar panels (2,400 W total, ~136 kg)
- **Actuation:** Two electric linear actuators (1,500 N each, 500 mm stroke)
- **Control:** Arduino Uno with dual-photoresistor tracking, relay module
- **Power supply:** 12 V dedicated circuit

The 6 tracking panels operate alongside 38 fixed panels in the same array.

## Results

| Metric | Value |
|--------|-------|
| Daily energy gained (tracking panels) | +3,035 Wh |
| Daily energy consumed by motors | ~5 Wh |
| Net daily gain | ~3,030 Wh |
| System-wide efficiency improvement | 3.2% |

The motors run for approximately 5 minutes per day, consuming only 5 Wh — less than 0.2% of the energy they help recover.

## Skills & Tools

- Embedded systems: Arduino Uno, photoresistors, relay modules, servo motors
- Mechanical design: steel structure fabrication, linear actuator integration
- Experimental methodology: controlled prototype testing, data collection
- Scientific reporting (submitted to FEBRACE — Feira Brasileira de Ciências e Engenharia)

## Report

[Download Full Project Report (PDF)](/files/solar-panel-tracker-febrace.pdf)
