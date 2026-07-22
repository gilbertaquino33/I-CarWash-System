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

The system consists of the following components: 
1. **WiFi CCTV Camera** - Captures live video from the carwash service bays.
2. **Python + OpenCV + Roboflow API** - Processes the live video stream. - Detects vehicles using AI-powered object detection. - Determines the occupancy status of each carwash bay.
3. **Database** - Receives processed data through the internet. - Stores and updates bay occupancy, service status, and reservation data in real time.
4. **React Native Mobile Application** - Retrieves real-time data from the database. - Allows administrators and staff to monitor bay occupancy, reservations, and system status anytime.


```text
                 📷 WiFi CCTV Camera
            (Captures Live Video Feed)
                       │
                       ▼
             🐍 Python + OpenCV
       (AI Processing & Vehicle Detection)
                       │
                       ▼
            🤖 Roboflow Inference API
      (Detects Vehicles & Bay Occupancy)
                       │
                       ▼
                 ☁️ Internet
                       │
                       ▼
                🗄️ Database
      (Stores Real-Time Monitoring Data)
                       │
                       ▼
        📱 React Native Mobile Application
      (Admin & Staff Monitoring Dashboard)
```

### Workflow

1. **WiFi CCTV Camera** captures the live video feed from the carwash area.
2. **Python with OpenCV** processes the video frames and sends them to the **Roboflow AI Inference API**.
3. **Roboflow** detects vehicles and determines the occupancy status of each washing bay.
4. The processed data is transmitted over the **Internet** and stored in the **Database**.
5. The **React Native Mobile Application** retrieves the latest data, allowing administrators and staff to monitor bay occupancy, reservations, and other operational information in real time.
````




---
> Bachelor of Science in Information Technology

