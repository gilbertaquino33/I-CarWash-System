# 🚗 A Computer Vision-Based Monitoring System for Carwash Enterprises

## 👥 Members
- Gilbert T. Aquino
- Mark Edzon G. Araojo
- Gilbert Bumanglag Jr.

---

## 📖 Introduction

This capstone project develops a **Computer Vision-Based Monitoring System** that automates carwash operations using **Artificial Intelligence (AI)** and **Computer Vision (CV)**. The system detects bay occupancy, records service duration, manages customer queues, and provides real-time monitoring through a digital dashboard, improving operational efficiency and customer experience.

---

## 🎯 Purpose

The project aims to:

- 🚘 Automate bay occupancy monitoring
- ⏱️ Record service duration automatically
- 📊 Provide digital sales and operational monitoring
- 📱 Improve customer reservation management

---

## 📌 Scope

The system is designed for **small and medium-sized carwash businesses** and includes:

- Real-time vehicle detection
- Automated service timing
- Digital monitoring dashboard
- Sales recording
- Customer reservation

---

## 📚 Definitions, Acronyms, and Abbreviations

| Term | Description |
|------|-------------|
| **AI** | Artificial Intelligence |
| **CV** | Computer Vision |
| **Object Detection** | Identifies vehicles through camera images. |
| **Bay Occupancy** | Detects whether a washing bay is occupied or vacant. |
| **SDLC** | System Development Life Cycle |
| **Waterfall Model** | A sequential software development approach. |


## 🏗️ System Architecture

The diagram below illustrates the overall architecture and data flow of the **Computer Vision-Based Monitoring System for Carwash Enterprises**.

<p align="center">
  <img src="system_arch.jpg" alt="System Architecture Diagram" width="800">
</p>

### Workflow

1. **WiFi CCTV Camera** captures the live video feed from the carwash area.
2. **Python with OpenCV** processes the video frames and sends them to the **Roboflow AI Inference API**.
3. **Roboflow** detects vehicles and determines the occupancy status of each washing bay.
4. The processed data is transmitted over the **Internet** and stored in the **Database**.
5. The **React Native Mobile Application** retrieves the latest data, allowing administrators and staff to monitor bay occupancy, reservations, and other operational information in real time.
````




---
> Bachelor of Science in Information Technology

