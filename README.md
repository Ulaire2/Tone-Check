# 同调 | ToneCheck v1.0

> “任何翻译都是一定程度上的本地化。”
> A specialized AI-powered LQA tool for Game Localization.
> 为本地化打造的 AI 语气校验与润色工作台。

![License](https://img.shields.io/badge/license-MIT-blue) ![Version](https://img.shields.io/badge/version-1.0.0-green) ![Tech](https://img.shields.io/badge/React-Vite-61DAFB)

## 📖 简介 | Introduction

在本地化，尤其游戏本地化过程中，保持角色语气（Tone）的一致性是最大的挑战之一。同调 (ToneCheck) 旨在通过大语言模型的推理能力，协助译员和 LQA 专家进行“人设对齐”。

它不仅仅是一个纠错工具，更是一个能理解“傲娇”、“严肃”、“史诗感”等复杂语气的虚拟助手。

## ✨ 核心特性 | Key Features

* 🎭 人设同调 (Persona Synchronization)
    * 内置示例游戏人设（如：矮人、精灵、赛博黑客）。
    * 支持自定义并保存你的专属人设（数据存储在本地，安全无忧）。
* ⚔️ 双向校验 (Bi-directional LQA)
    * 英 ➡ 中：专注识别翻译腔、漏译、风格不符。
    * 中 ➡ 英：专注识别中式英语（Chinglish）、语法错误。
    * 一键交换文本 (Swap)，流畅切换工作流。
* 🔍 视觉高亮 (Visual Insights)
    * 像手术刀一样精准：AI 会直接高亮出原文中的陷阱和译文中的 OOC（Out of Character）片段。
* 📊 五维评分 (5-Tier Grading)
    * 从 `S (信达雅)` 到 `D (致命错误)` 的专业评级体系，直观反馈翻译质量。

## 🚀 快速开始 | Quick Start

1.  配置大脑：点击右上角设置，填入你的 API Key。
2.  选择方向：确认是【英➡中】还是【中➡英】。
3.  设定人设：告诉 AI 这句话是谁说的（例如：“一个暴躁的矮人铁匠”）。
4.  一键同调：输入原文和译文，点击检查，获取报告。
