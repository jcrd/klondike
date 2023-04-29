POD_NAME ?= predictor
IMAGE_NAME ?= klondike
CONTAINER_NAME := $(IMAGE_NAME)-$(POD_NAME)

run:
	podman build -t $(IMAGE_NAME) .
	podman container rm -f $(CONTAINER_NAME)
	podman run -dt --name $(CONTAINER_NAME) --pod $(POD_NAME) $(IMAGE_NAME)

.PHONY: run
