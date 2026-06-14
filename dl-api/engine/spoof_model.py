import torch
import torch.nn as nn
import torchvision.models as models
from torchvision.models import MobileNet_V3_Small_Weights

class MuzzleSpoofDetector(nn.Module):
    """
    MobileNetV3-Small backbone with a custom binary classification head.

    Architecture:
        MobileNetV3-Small (ImageNet pretrained)
            └── Custom head:
                  AdaptiveAvgPool2d (functional or as layer)
                  Flatten
                  Linear(576 → 256) + Hardswish + Dropout(0.3)
                  Linear(256 → 64)  + Hardswish + Dropout(0.2)
                  Linear(64  → 2)
    """
    def __init__(self, dropout: float = 0.3, freeze_backbone: bool = True):
        super(MuzzleSpoofDetector, self).__init__()
        # Use MobileNetV3 Small Features
        self.features = models.mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features
        
        if freeze_backbone:
            for param in self.features.parameters():
                param.requires_grad = False
        
        self.avgpool = nn.AdaptiveAvgPool2d(1)
                
        # Adjusted to match state_dict indices (Linear at 1, 4, 7)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(576, 256),   # Index 1
            nn.Hardswish(),        # Index 2
            nn.Dropout(p=dropout), # Index 3
            nn.Linear(256, 64),    # Index 4
            nn.Hardswish(),        # Index 5
            nn.Dropout(p=0.2),     # Index 6
            nn.Linear(64, 2)       # Index 7
        )
        
    def forward(self, x):
        x = self.features(x)
        x = self.avgpool(x)
        return self.classifier(x)
