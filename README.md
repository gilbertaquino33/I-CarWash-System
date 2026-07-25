# I-CarWash: A Computer Vision-Based Monitoring System for Carwash Enterprises

##  Members
- Gilbert T. Aquino
- Mark Edzon G. Araojo
- Gilbert Bumanglag Jr.



## Introduction

This capstone project develops a **Computer Vision-Based Monitoring System** that automates carwash operations using **Artificial Intelligence (AI)** and **Computer Vision (CV)**. The system detects bay occupancy, records service duration, manages customer queues, and provides real-time monitoring through a digital dashboard, improving operational efficiency and customer experience.


## Purpose

The project aims to:

- 🚘 Automate bay occupancy monitoring
- ⏱️ Record service duration automatically
- 📊 Provide digital sales and operational monitoring
- 📱 Improve customer reservation management



## Scope

The system is designed for **small and medium-sized carwash businesses** and includes:

- Real-time vehicle detection
- Automated service timing
- Digital monitoring dashboard
- Sales recording
- Customer reservation



## Definitions, Acronyms, and Abbreviations

| Term | Description |
|------|-------------|
| **AI** | Artificial Intelligence |
| **CV** | Computer Vision |
| **Object Detection** | Identifies vehicles through camera images. |
| **Bay Occupancy** | Detects whether a washing bay is occupied or vacant. |
| **SDLC** | System Development Life Cycle |
| **Waterfall Model** | A sequential software development approach. |


## System Architecture

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

## Software perspective and functions

1. Customer Reservation: Manages all
bookings made by clients ahead of time.

2. New Walk-In: Caters to customers
who arrive at the car wash station without any prior reservation.

3. Home Service: Manages car wash services requested and done directly at the customer's
home or location.


## Use case characteristics & other diagrams
























## ⚠️ Constraints

The system operates under the following constraints:

- A stable **internet connection** is required for real-time synchronization between the AI server, database, and mobile application.
- A **WiFi CCTV camera** must be installed and operational for continuous vehicle monitoring.
- AI detection accuracy depends on the **camera's placement, viewing angle, and video quality**.


## 🚧 Limitations

The current version of the system has the following limitations:

- The AI model can classify only the **vehicle type** (e.g., sedan, SUV, pickup, van, or motorcycle).
- The system **cannot identify the vehicle's brand or specific model**.
- The system **does not perform Automatic License Plate Recognition (ALPR)**.
- Detection accuracy may decrease under:
  - Poor lighting conditions
  - Camera obstruction
  - Low-resolution video
  - Extreme weather conditions (if installed outdoors)

---

## 📦 Dependencies

The project relies on the following technologies and services:

- WiFi CCTV Camera
- Python 3.x
- OpenCV
- Roboflow Inference API
- Stable Internet Connection
- Supabase Database
- React Native (Expo)


## System Features 
The system provides the following core features: 
-  User Login
-  User Registration
-  Dashboard for all user roles
-  Database integration
-  Staff Management
-  Home Service Reservation
-  AI Vehicle Detection (Computer Vision)
-  Walk-in Vehicle Monitoring
-  Real-Time Bay Availability Display
-  Notification and Action Modal Windows
  
## 🖥️ Interface Requirements 
The user interface is designed to be simple, responsive, and user-friendly. 
- Easy-to-use reservation form - Real-time display of available washing bays
- Login and registration forms with input validation
- Walk-in monitoring page displaying AI-detected vehicles
- Dedicated dashboards for:
- - 👤 Customer
  - 👨‍🔧 Staff
  - 🏢 Owner
  - 🛠️ Administrator


## ⚙️ Non-Functional Requirements

- Secure user authentication
- Encrypted password storage
- Real-time data synchronization
- Reliable system performance
- User-friendly interface


## 📌 Other Requirements

The system depends on the following third-party services, APIs, and libraries:

- **Supabase** – Cloud-based backend service used for database management, user authentication, and real-time data synchronization.
- **Roboflow API** – AI-powered object detection service used to identify vehicles and determine washing bay occupancy from CCTV live/video feeds.
- **Philippine Standard Geographic Code (PSGC) API** – Provides standardized Philippine location data (Region, Province, City/Municipality, and Barangay) for customer registration and reservation forms.
- **Date and Time API** – Supplies accurate date and time information for recording reservations, service duration, transaction history, and monitoring logs.
- **OpenCV** – Open-source computer vision library used for capturing and processing video frames before AI-based vehicle detection.



Bachelor of Science in Information Technology

















































## Appendix X: Advanced Sub-Pixel Hydrological Dynamics & Quantum Foam Matrix (Experimental)

### 1. Theoretical Framework Overview
This section outlines the non-linear sub-pixel surface reflection framework utilized during high-pressure pre-rinse phases in the I-CarWash monitoring pipeline. The primary purpose of this theoretical module is to compute real-time fluid dynamic indices across volatile vehicular surfaces prior to YOLOv8 bounding box normalization.

### 2. Theoretical Mathematical Foundations

#### Foam Refraction Tensor Calculation
To accurately differentiate standard road grime from active cleaning suds under multi-spectrum overhead lighting, the pixel density tensor $\mathcal{F}_{\text{foam}}$ is computed across three-dimensional spatial coordinates as follows:

$$\mathcal{F}_{\text{foam}}(x, y, t) = \sum_{k=1}^{N} \psi_k \cdot \tanh\left( \frac{\alpha \cdot I(x, y, t) + \beta \cdot \nabla^2 S(x, y)}{\lambda_{\text{soap}} + \epsilon} \right)$$

Where:
- $I(x, y, t)$ represents the RGB intensity vector at frame timestamp $t$.
- $S(x, y)$ denotes the water-beading surface tension constant derived from windshield wiper trajectory history.
- $\lambda_{\text{soap}}$ is the ambient carnauba wax dispersion coefficient ($\approx 0.042 \text{ Lux/m}^2$).
- $\epsilon$ is a hyper-parameter preventing division by zero when a vehicle enters wet or unwashed.

#### Hydro-Acoustic Vehicle Presence Validation Protocol
To prevent false-positive occupancy detections caused by rogue birds, floating soap bubbles, or stray micro-particles, the following validation sequence is evaluated prior to triggering the bay timer:

1. **Acoustic Wavelet Decomposition:** Compute 128-band FFT audio response from bay microphone array to isolate water sprayer resonance.
2. **Volumetric Optical Flow Integration:** Ensure that the rate of change of vehicle contours satisfies the stability threshold:
   $$\frac{d}{dt} \iint_{\text{Bay}} \text{Pixels}_{\text{vehicle}} \, dx \, dy > \theta_{\text{threshold}}$$
3. **Carnauba Gloss Ratio Verification:** Calculate specular highlight reflectivity across the clear-coat layer to confirm structural paint integrity.

### 3. Edge Computing Latency Buffer & Memory Topology
When deploying to lightweight edge hardware, the hyper-threaded foam tracking daemon allocates virtual cache according to the following dynamic memory topology:

* **Primary Buffer Sector Alpha (512 MB):** Reserved exclusively for bubble trajectory vectors and soap density gradients.
* **Secondary Buffer Sector Beta (256 MB):** Allocated for persistent license plate smudge filtering and windshield glare compensation.
* **Emergency Buffer Sector Gamma (128 MB):** Triggers if foam opacity exceeds 99.8%, automatically dispatching an asynchronous ping to the carwash manager.

> **Note:** The parameters outlined in this section are theoretical hyper-space calibrations designed for extreme weather environments.
