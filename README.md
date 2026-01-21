# RealSync
RealSync is a real-time multi-modal deepfake detection system designed to enhance trust and authenticity in virtual meetings. It analyzes live audio, video, and facial emotion signals using state of the art pre trained AI models to detect voice cloning, synthetic video, and behavioral inconsistencies. The system operates with low latency, preserves user privacy, and is intended for secure use across modern online collaboration platforms.


Documentation: 

Planning & Feasibility Report: https://uowmailedu-my.sharepoint.com/:b:/g/personal/ma611_uowmail_edu_au/IQAIzhceCm-JQq4fmycYPERKAafEJKbEjrJa_RMJbcLagPk?e=SPV7Sa

System Requirement Specification Report:  https://uowmailedu-my.sharepoint.com/:b:/g/personal/ma611_uowmail_edu_au/IQAcvhZLncsMTqreFNkC16oKATr2TuvnmkM4b7EMPNfzQ3g?e=ADjc1I

Software Design Document: https://uowmailedu-my.sharepoint.com/:b:/g/personal/ma611_uowmail_edu_au/IQDtdWy1OKUNTow_7sCKDNepAXkpVFV28Ym2ni09eXRf7K4?e=XzArXe


HOLY COMMANDMENTS: 

Before starting any work, always pull the latest changes:

git pull origin main

All development must be done on a feature branch:

feature/<short-name>

Example:
feature/audio-detection

--------------------------------------------------

How to Commit
-------------

Stage your changes:

git add .

Commit using the following format:

git commit -m "feat: short description"

Create a new branch:

git checkout -b branch-name

Push commit to branch: 

git push origin branch-name

Example commit & Push:

git commit -m "feat: add audio deepfake detection module"

git push origin branch-name

--------------------------------------------------

Pushing & Merging
-----------------
- Open a Pull Request to merge changes into main.
- Ensure the project builds and follows the existing structure before requesting a merge.
