import torch
import torch.nn as nn
import torch.nn.functional as F
import timm

class MegaDescriptorModel(nn.Module):
    MODEL_NAME = "hf-hub:BVRA/MegaDescriptor-L-384"

    def __init__(self, checkpoint_path: str = None):
        super().__init__()
        
        # Set pretrained=True to download the L-384 weights
        self.encoder = timm.create_model(
            self.MODEL_NAME,
            pretrained=True, 
            num_classes=0
        )
        self.embedding_dim = int(getattr(self.encoder, "num_features", 1536))

    def forward_once(self, x: torch.Tensor) -> torch.Tensor:
        raw_embedding = self.encoder(x)
        return F.normalize(raw_embedding, p=2, dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.forward_once(x)