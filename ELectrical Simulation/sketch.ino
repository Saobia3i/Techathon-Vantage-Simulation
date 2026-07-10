#include <ESP32Servo.h>

const int NUM_JOINTS = 6;

// Pin Definitions matching the diagram.json
const int POT_PINS[NUM_JOINTS]   = {32, 33, 34, 35, 36, 39};
const int SERVO_PINS[NUM_JOINTS] = {12, 13, 14, 15, 25, 26};
const int LED_PINS[NUM_JOINTS]   = {4, 5, 16, 17, 18, 19};
const int STATUS_LED = 21;

// Safety Bounds
const int SAFE_MIN = 10;
const int SAFE_MAX = 170;

Servo servos[NUM_JOINTS];
int lastAngles[NUM_JOINTS] = {-1, -1, -1, -1, -1, -1};

void setup() {
  Serial.begin(115200);
  
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, HIGH); // System Armed
  
  for (int i = 0; i < NUM_JOINTS; i++) {
    pinMode(POT_PINS[i], INPUT);
    pinMode(LED_PINS[i], OUTPUT);
    servos[i].attach(SERVO_PINS[i]);
  }
  
  Serial.println("System Booted. Single-Pipeline Safety Validator Armed.");
}

void loop() {
  bool stateChanged = false;
  String inputLog = "INPUT  -> ";
  String safetyLog = "SAFETY -> ";
  bool clampedFlag = false;

  for (int i = 0; i < NUM_JOINTS; i++) {
    // 1. Read Mock Input (Map 12-bit ADC 0-4095 to 0-180 degrees)
    int rawVal = analogRead(POT_PINS[i]);
    int rawAngle = map(rawVal, 0, 4095, 0, 180);
    
    // Smooth out jitter for Wokwi simulation clarity
    if (abs(rawAngle - lastAngles[i]) > 1) {
      stateChanged = true;
      digitalWrite(LED_PINS[i], HIGH);
    } else {
      digitalWrite(LED_PINS[i], LOW);
    }

    // 2. Safety Validator (Clamp Limits)
    int safeAngle = rawAngle;
    bool wasClamped = false;
    
    if (safeAngle < SAFE_MIN) {
      safeAngle = SAFE_MIN;
      wasClamped = true;
    } else if (safeAngle > SAFE_MAX) {
      safeAngle = SAFE_MAX;
      wasClamped = true;
    }

    if (wasClamped) clampedFlag = true;

    // 3. Output Execution
    servos[i].write(safeAngle);
    lastAngles[i] = safeAngle;

    // Format Telemetry Logs
    inputLog += "J" + String(i+1) + ":" + String(rawAngle) + "° ";
    safetyLog += "J" + String(i+1) + ":" + String(safeAngle) + "°";
    if (wasClamped) safetyLog += "[CLAMPED]";
    safetyLog += " ";
  }

  // 4. Print Structured Telemetry (Only on change)
  if (stateChanged) {
    Serial.println("--------------------------------------------------");
    Serial.println(inputLog);
    Serial.println(safetyLog);
    
    if (clampedFlag) {
      Serial.println("OUTPUT -> WARNING: Safety layer intervened. Out-of-bounds inputs clamped.");
    } else {
      Serial.println("OUTPUT -> SUCCESS: Exact requested angles safely executed.");
    }
  }

  delay(50); // Polling delay
}